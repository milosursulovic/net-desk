using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Management;
using System.Security.Cryptography;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Win32;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// The main work loop - checks the mailbox (Paths.ManagerCommandFile) on
    /// every tick, but wakes up EARLIER if NetdeskAgentManagerService.
    /// OnCustomCommand signals WakeEvent (the low-latency path), so the
    /// periodic tick remains purely a safety net (the custom command signal
    /// lost e.g. because the Manager was stopped when the command was written).
    /// </summary>
    public class ManagerWorker
    {
        private static readonly TimeSpan LoopTick = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan ServiceControlTimeout = TimeSpan.FromSeconds(30);

        private readonly object _executeLock = new object();

        // The new, independent HTTP channel (enroll/heartbeat/job-poll to the backend,
        // NOT the mailbox) - _client stays null (the channel is silently skipped on
        // every tick) if config.json doesn't exist or is invalid.
        // The mailbox path below (ProcessMailboxIfPresentAsync) works INDEPENDENTLY of
        // this and is never shut down because of problems with this channel - that's
        // the whole point of this change (the Manager stays manageable via the mailbox
        // even if the HTTP channel never works on some machine).
        private ManagerConfig _config;
        private ManagerState _state;
        private ManagerApiClient _client;

        public AutoResetEvent WakeEvent { get; } = new AutoResetEvent(false);

        public async Task RunAsync(CancellationToken token)
        {
            FileLogger.Info("Netdesk Agent Manager se pokreće...");

            InitializeHttpChannel();

            // Check the mailbox ONCE before entering the loop - catches the
            // "command arrived while the Manager was stopped" case.
            await ProcessMailboxIfPresentAsync().ConfigureAwait(false);

            var lastHeartbeat = DateTime.MinValue;
            var lastJobsPoll = DateTime.MinValue;

            while (!token.IsCancellationRequested)
            {
                try
                {
                    WaitHandle.WaitAny(new[] { token.WaitHandle, WakeEvent }, LoopTick);

                    if (token.IsCancellationRequested) break;

                    await ProcessMailboxIfPresentAsync().ConfigureAwait(false);

                    if (_client != null)
                    {
                        if (!_state.IsEnrolled)
                        {
                            await EnsureEnrolledAsync().ConfigureAwait(false);
                        }
                        else
                        {
                            if ((DateTime.UtcNow - lastHeartbeat).TotalSeconds >= _config.HeartbeatIntervalSeconds)
                            {
                                await DoHeartbeatAsync().ConfigureAwait(false);
                                lastHeartbeat = DateTime.UtcNow;
                            }

                            if ((DateTime.UtcNow - lastJobsPoll).TotalSeconds >= _config.JobsPollIntervalSeconds)
                            {
                                await DoJobsPollAsync().ConfigureAwait(false);
                                lastJobsPoll = DateTime.UtcNow;
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    // The loop must survive any error from a single cycle -
                    // the next tick tries again.
                    FileLogger.Error("Neočekivana greška u Manager radnoj petlji", ex);
                }
            }

            _client?.Dispose();
            FileLogger.Info("Netdesk Agent Manager zaustavljen.");
        }

        /// <summary>
        /// Best-effort - config.json doesn't have to exist (the machine hasn't yet
        /// received the updated bootstrap preset, or the admin knowingly doesn't want the new
        /// channel on this machine) - in that case _client stays null and
        /// the loop above silently skips all HTTP steps forever (until the service
        /// is next started, e.g. after config.json is installed).
        /// </summary>
        private void InitializeHttpChannel()
        {
            try
            {
                _config = ManagerConfig.Load(Paths.ManagerConfigFile);
                _state = ManagerState.Load(Paths.ManagerOwnStateFile);
                _client = new ManagerApiClient(_config.ServerBaseUrl);
                FileLogger.Info("Manager-ov nezavisni HTTP kanal inicijalizovan.");
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Manager-ov nezavisni HTTP kanal se ne pokreće (" + ex.Message + ") - mailbox put i dalje radi normalno.");
                _client = null;
            }
        }

        private async Task EnsureEnrolledAsync()
        {
            if (string.IsNullOrWhiteSpace(_config.EnrollToken))
            {
                FileLogger.Warn("Manager nije registrovan na novom kanalu, a EnrollToken nije podešen u config.json - preskačem enroll.");
                return;
            }

            var ip = NetworkInfo.GetPrimaryIPv4();
            if (ip == null)
            {
                FileLogger.Warn("Nijedna aktivna mrežna adresa - preskačem enroll pokušaj do sledećeg tick-a.");
                return;
            }

            try
            {
                var response = await _client.EnrollAsync(
                    _config.EnrollToken, NetworkInfo.GetHostname(), ManagerVersionInfo.Current, ip).ConfigureAwait(false);

                _state.ManagerId = response.ManagerId;
                _state.ApiKey = response.ApiKey;
                _state.Save(Paths.ManagerOwnStateFile);

                FileLogger.Info("Manager uspešno registrovan na novom kanalu. ManagerId=" + response.ManagerId);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Enrollment Manager-a (novi kanal) neuspešan", ex);
            }
        }

        private async Task DoHeartbeatAsync()
        {
            try
            {
                var serviceStatus = GetNetdeskAgentServiceStatus();
                var startMode = GetNetdeskAgentStartMode();

                await _client.HeartbeatAsync(
                    _state.ManagerId, _state.ApiKey, NetworkInfo.GetHostname(), ManagerVersionInfo.Current,
                    serviceStatus, startMode).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Heartbeat Manager-a (novi kanal) neuspešan", ex);
            }
        }

        private async Task DoJobsPollAsync()
        {
            ManagerApiClient.ManagerJobsResponse response;
            try
            {
                response = await _client.GetJobsAsync(_state.ManagerId, _state.ApiKey).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Preuzimanje komandi sa novog kanala neuspešno", ex);
                return;
            }

            if (response?.Jobs == null || response.Jobs.Count == 0) return;

            foreach (var job in response.Jobs)
            {
                await ExecuteManagerJobAsync(job).ConfigureAwait(false);
            }
        }

        /// <summary>
        /// Execution is NOT serialized against
        /// ProcessMailboxIfPresentAsync with a separate lock - deliberately unnecessary, both loops
        /// (the mailbox tick above and this poll) are part of the SAME sequential
        /// RunAsync tick on a single async loop (NetdeskAgentManagerService.
        /// OnCustomCommand only signals WakeEvent, it doesn't start separate
        /// processing) - real concurrency between the two paths doesn't exist.
        /// </summary>
        private async Task ExecuteManagerJobAsync(ManagerApiClient.ManagerJobItem job)
        {
            FileLogger.Info("Obrađujem komandu sa novog kanala " + job.Id + " (" + job.CommandType + ")...");

            var result = new ManagerApiClient.ManagerJobResultRequest { Success = false };
            var sw = Stopwatch.StartNew();

            try
            {
                switch (job.CommandType)
                {
                    case "start_service":
                        ControlService(ServiceNameOrDefault(job.Payload), "start");
                        result.Success = true;
                        break;

                    case "stop_service":
                        ControlService(ServiceNameOrDefault(job.Payload), "stop");
                        result.Success = true;
                        break;

                    case "restart_service":
                        ControlService(ServiceNameOrDefault(job.Payload), "restart");
                        result.Success = true;
                        break;

                    case "set_service_start_mode":
                        SetServiceStartMode(ServiceNameOrDefault(job.Payload), (string)job.Payload["startMode"]);
                        result.Success = true;
                        break;

                    case "install_update":
                        var install = await InstallUpdateFromServerAsync(job.Payload).ConfigureAwait(false);
                        result.Success = install.Success;
                        result.ErrorOutput = install.FailureReason;
                        break;

                    default:
                        result.ErrorOutput = "Nepoznata komanda sa novog kanala: " + job.CommandType;
                        break;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Izvršavanje komande " + job.Id + " (" + job.CommandType + ") neuspešno", ex);
                result.ErrorOutput = ex.Message;
            }

            sw.Stop();
            result.ExitCode = result.Success == true ? 0 : 1;
            result.DurationMs = sw.ElapsedMilliseconds;

            try
            {
                await _client.SubmitJobResultAsync(_state.ManagerId, _state.ApiKey, job.Id, result).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Javljanje rezultata komande " + job.Id + " neuspešno", ex);
            }
        }

        private static string ServiceNameOrDefault(JObject payload)
        {
            var name = payload != null ? (string)payload["serviceName"] : null;
            return string.IsNullOrWhiteSpace(name) ? "NetdeskAgent" : name;
        }

        private static string GetNetdeskAgentServiceStatus()
        {
            try
            {
                using (var sc = new ServiceController("NetdeskAgent"))
                {
                    return sc.Status.ToString();
                }
            }
            catch
            {
                // The service isn't installed on this machine, or the query failed -
                // "Unknown" is the correct answer in both cases, not an error that
                // may bring down the whole heartbeat.
                return "Unknown";
            }
        }

        /// <summary>
        /// ServiceController has no "startup type" property (only the run-time
        /// status) - it's read directly from the registry Start DWORD value,
        /// the same source the SCM itself uses (2=Automatic, 3=Manual,
        /// 4=Disabled; 0/1=Boot/System drivers, not applicable to ordinary
        /// services like NetdeskAgent).
        /// </summary>
        private static string GetNetdeskAgentStartMode()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\NetdeskAgent"))
                {
                    var value = key?.GetValue("Start");
                    if (value == null) return "Unknown";

                    switch (Convert.ToInt32(value))
                    {
                        case 2: return "Automatic";
                        case 3: return "Manual";
                        case 4: return "Disabled";
                        default: return "Unknown";
                    }
                }
            }
            catch
            {
                return "Unknown";
            }
        }

        /// <summary>
        /// Changes the startup type via sc.exe (not P/Invoke ChangeServiceConfig) -
        /// a rare, admin-triggered action, not a hot path; sc.exe is a standard,
        /// auditable sysadmin tool, the same trust level as InstallUtil.exe,
        /// which is already used in the install steps.
        /// </summary>
        private static void SetServiceStartMode(string serviceName, string startMode)
        {
            string scArg;
            switch (startMode)
            {
                case "Automatic": scArg = "auto"; break;
                case "Manual": scArg = "demand"; break;
                case "Disabled": scArg = "disabled"; break;
                default: throw new ArgumentException("Nepoznat startup tip: " + startMode);
            }

            var psi = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = "config \"" + serviceName + "\" start= " + scArg,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            using (var process = Process.Start(psi))
            {
                var stdout = process.StandardOutput.ReadToEnd();
                var stderr = process.StandardError.ReadToEnd();
                process.WaitForExit((int)ServiceControlTimeout.TotalMilliseconds);

                if (process.ExitCode != 0)
                {
                    throw new InvalidOperationException(
                        "sc.exe config neuspešan (exit " + process.ExitCode + "): " + stdout + stderr);
                }
            }

            FileLogger.Info("Servis '" + serviceName + "' startup tip postavljen na '" + startMode + "'.");
        }

        private class InstallResult
        {
            public bool Success { get; set; }
            public string FailureReason { get; set; }
        }

        /// <summary>
        /// install_update from the new channel - unlike the mailbox install_files
        /// (where the Agent ALREADY downloads/extracts the package before handing over
        /// StagingDir), here the Manager downloads the package ITSELF (with its own
        /// credentials - never the Agent's, see ManagerApiClient.cs), and
        /// only then calls the existing InstallFilesAsync with a synthesized,
        /// memory-only ManagerCommand object (never written to the
        /// mailbox file).
        /// </summary>
        private async Task<InstallResult> InstallUpdateFromServerAsync(JObject payload)
        {
            var releaseId = payload?["releaseId"]?.Value<long>() ?? 0;
            if (releaseId <= 0)
            {
                return new InstallResult { Success = false, FailureReason = "payload.releaseId nedostaje." };
            }

            var serviceName = ServiceNameOrDefault(payload);
            var installDirOverride = payload["installDir"]?.Value<string>();
            var expectedSha256 = payload["sha256"]?.Value<string>();

            string installDir;
            try
            {
                installDir = string.IsNullOrWhiteSpace(installDirOverride)
                    ? ResolveInstallDirFromRegistry(serviceName)
                    : installDirOverride;
            }
            catch (Exception ex)
            {
                return new InstallResult { Success = false, FailureReason = ex.Message };
            }

            var stagingRoot = Path.Combine(Paths.UpdateStagingDir, Guid.NewGuid().ToString("N"));
            var packagePath = stagingRoot + ".zip";
            var extractDir = stagingRoot;

            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(packagePath) ?? Paths.UpdateStagingDir);

                await _client.DownloadUpdateFileAsync(_state.ManagerId, _state.ApiKey, releaseId, packagePath)
                    .ConfigureAwait(false);

                if (!string.IsNullOrEmpty(expectedSha256) && !VerifySha256(packagePath, expectedSha256))
                {
                    return new InstallResult { Success = false, FailureReason = "SHA-256 provera neuspešna - paket odbačen." };
                }

                ZipFile.ExtractToDirectory(packagePath, extractDir);

                var command = new ManagerCommand
                {
                    CommandId = Guid.NewGuid().ToString("N"),
                    Action = "install_files",
                    ServiceName = serviceName,
                    StagingDir = extractDir,
                    InstallDir = installDir,
                    // ServerBaseUrl deliberately empty - ReportResultIfConfiguredAsync
                    // (inside InstallFilesAsync) therefore silently skips the UpdateReportClient
                    // call, the result is reported HERE via the new channel instead.
                };

                return await InstallFilesAsync(command).ConfigureAwait(false);
            }
            finally
            {
                try { if (File.Exists(packagePath)) File.Delete(packagePath); } catch { /* best effort */ }
                try { if (Directory.Exists(extractDir)) Directory.Delete(extractDir, true); } catch { /* best effort */ }
            }
        }

        private static bool VerifySha256(string filePath, string expectedHex)
        {
            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                var hashBytes = sha256.ComputeHash(stream);
                var hex = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                return string.Equals(hex, expectedHex.ToLowerInvariant(), StringComparison.Ordinal);
            }
        }

        /// <summary>
        /// "Where this service actually lives" according to the SCM itself (ImagePath) - the only
        /// truth that can never be stale relative to what is
        /// actually running, it doesn't require admin input, and it is NOT "communication with
        /// the Agent process" (reading an OS-maintained registry value, not IPC
        /// with the process itself).
        /// </summary>
        private static string ResolveInstallDirFromRegistry(string serviceName)
        {
            using (var key = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\" + serviceName))
            {
                var imagePath = key?.GetValue("ImagePath") as string;
                if (string.IsNullOrWhiteSpace(imagePath))
                {
                    throw new InvalidOperationException(
                        "Ne mogu da nađem ImagePath za servis '" + serviceName + "' u registry-ju.");
                }

                // ImagePath is usually a quoted path, optionally
                // followed by arguments (e.g. "\"C:\Program Files\...\X.exe\" -arg") -
                // only the first quoted (or the first
                // space-separated, if there are no quotes) token is taken.
                var exePath = imagePath.Trim();
                if (exePath.StartsWith("\""))
                {
                    var end = exePath.IndexOf('"', 1);
                    exePath = end > 0 ? exePath.Substring(1, end - 1) : exePath.Trim('"');
                }
                else
                {
                    var spaceIdx = exePath.IndexOf(' ');
                    if (spaceIdx > 0) exePath = exePath.Substring(0, spaceIdx);
                }

                var dir = Path.GetDirectoryName(exePath);
                if (string.IsNullOrWhiteSpace(dir))
                {
                    throw new InvalidOperationException(
                        "Ne mogu da razrešim install dir iz ImagePath ('" + imagePath + "') za servis '" + serviceName + "'.");
                }

                return dir;
            }
        }

        private async Task ProcessMailboxIfPresentAsync()
        {
            ManagerCommand command;

            lock (_executeLock)
            {
                command = Dequeue();
            }

            if (command == null) return;

            FileLogger.Info("Obrađujem komandu " + command.CommandId + " (" + command.Action + ")...");

            try
            {
                if (command.Action == "control_service")
                {
                    ControlService(command.ServiceName, command.ServiceAction);
                }
                else if (command.Action == "install_files")
                {
                    await InstallFilesAsync(command).ConfigureAwait(false);
                }
                else
                {
                    FileLogger.Warn("Nepoznata Manager komanda: " + command.Action);
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Obrada komande " + command.CommandId + " neuspešna", ex);
            }
        }

        /// <summary>
        /// Single-shot: the file is deleted IMMEDIATELY once it's read (before execution),
        /// prevents double execution if both the tick and WakeEvent arrive close together.
        /// </summary>
        private static ManagerCommand Dequeue()
        {
            var path = Paths.ManagerCommandFile;
            if (!File.Exists(path)) return null;

            try
            {
                var json = File.ReadAllText(path);
                TryDelete(path);
                return JsonConvert.DeserializeObject<ManagerCommand>(json);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Čitanje mailbox komande neuspešno", ex);
                TryDelete(path);
                return null;
            }
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
                // best effort
            }
        }

        private static void ControlService(string serviceName, string action)
        {
            using (var sc = new ServiceController(serviceName))
            {
                switch (action)
                {
                    case "start":
                        StartService(sc);
                        break;
                    case "stop":
                        StopService(sc);
                        break;
                    case "restart":
                        StopService(sc);
                        StartService(sc);
                        break;
                    default:
                        FileLogger.Warn("Nepoznata service akcija: " + action);
                        return;
                }
            }

            FileLogger.Info("Servis '" + serviceName + "' - akcija '" + action + "' izvršena.");
        }

        private static void StopService(ServiceController sc)
        {
            sc.Refresh();
            if (sc.Status != ServiceControllerStatus.Stopped)
            {
                sc.Stop();
                sc.WaitForStatus(ServiceControllerStatus.Stopped, ServiceControlTimeout);
            }
        }

        private static void StartService(ServiceController sc)
        {
            sc.Refresh();
            if (sc.Status != ServiceControllerStatus.Running)
            {
                sc.Start();
                sc.WaitForStatus(ServiceControllerStatus.Running, ServiceControlTimeout);
            }
        }

        /// <summary>
        /// stop the service → delete InstallDir COMPLETELY → copy StagingDir into
        /// InstallDir (recursively, DirectorySync - fixes the old Updater
        /// bug with the amd64\/x86\ subfolders, and now has retry on locked
        /// files - see the DirectorySync comment) → start the service.
        /// GUARANTEE: files are NEVER touched if the stop didn't succeed -
        /// this is checked explicitly BEFORE any deleting/copying.
        ///
        /// NO backup/rollback - a deliberate simplification after a live
        /// incident where the rollback itself (copying back) failed for the same
        /// reason as the original update (a locked WinDivert64.sys),
        /// leaving the machine in a confusing "both the update and the rollback failed"
        /// state. A simple "delete then install" doesn't have that second point of failure -
        /// on an error, InstallDir may be left partially filled/empty,
        /// the service stays stopped, and that's a readable/predictable state for
        /// the next attempt (a new update or force_reinstall_agent), not a
        /// hidden "looks recovered but isn't" state. InstallDir/
        /// StagingDir/ServiceName are arbitrary paths/name - this method
        /// isn't tied to NetdeskAgent specifically. Config.json is NOT touched in
        /// the current (NetdeskAgent) usage - it lives outside InstallDir.
        /// </summary>
        /// <summary>
        /// Returns an InstallResult (instead of void) so the caller from the NEW channel
        /// (InstallUpdateFromServerAsync) can report the outcome via the
        /// manager_jobs result - the old mailbox caller
        /// (ProcessMailboxIfPresentAsync) still just discards the return
        /// value (ReportResultIfConfiguredAsync below remains ITS only
        /// reporting path, unchanged).
        /// </summary>
        private static async Task<InstallResult> InstallFilesAsync(ManagerCommand command)
        {
            var serviceName = string.IsNullOrEmpty(command.ServiceName) ? "NetdeskAgent" : command.ServiceName;

            string stopError;
            if (!TryControlService(serviceName, "stop", out stopError))
            {
                var stopFailureReason =
                    "Zaustavljanje servisa '" + serviceName + "' neuspešno - fajlovi NISU menjani: " + stopError;
                FileLogger.Error(stopFailureReason, null);
                await ReportResultIfConfiguredAsync(command, false, stopFailureReason).ConfigureAwait(false);
                return new InstallResult { Success = false, FailureReason = stopFailureReason };
            }

            var success = false;
            string failureReason = null;

            try
            {
                StopWinDivertDriverIfPresent();
                DirectorySync.DeleteDirectoryWithRetry(command.InstallDir);
                DirectorySync.CopyDirectoryRecursive(command.StagingDir, command.InstallDir);

                ControlService(serviceName, "start");
                success = true;
            }
            catch (Exception ex)
            {
                failureReason = ex.Message;
                FileLogger.Error(
                    "Instalacija fajlova neuspešna - servis OSTAJE zaustavljen, nema automatskog rollback-a", ex);
            }

            await ReportResultIfConfiguredAsync(command, success, failureReason).ConfigureAwait(false);
            return new InstallResult { Success = success, FailureReason = failureReason };
        }

        /// <summary>
        /// Actively stops the WinDivert kernel driver (WinDivert64.sys, part of
        /// DnsQueryCollector - see Netdesk.Agent.Common/DnsLogs/WinDivertInterop.cs)
        /// before deleting/copying the install folder - the same technique as the
        /// "Prinudno zaustavi WinDivert drajver" (force-stop WinDivert driver) PowerShell preset
        /// (powershellPresets.js), ported here so an update via the Manager
        /// doesn't have to rely SOLELY on the passive retry in
        /// DirectorySync.DeleteDirectoryWithRetry (8 attempts/750ms, ~6s) -
        /// that retry still remains as a safety net if the driver is locked
        /// for some OTHER reason, not just a slow unload.
        ///
        /// Doesn't rely on a hardcoded service name ("WinDivert" isn't part of
        /// the library's official contract) - finds the driver BY PATH via
        /// Win32_SystemDriver (WMI, kernel-mode drivers/services). Best-effort:
        /// if the WMI query or sc stop fails, only a warning is logged -
        /// the passive retry in DeleteDirectoryWithRetry remains the last line
        /// of defense, it must not bring down the whole update.
        /// </summary>
        private static void StopWinDivertDriverIfPresent()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT * FROM Win32_SystemDriver WHERE PathName LIKE '%WinDivert64.sys%' OR Name LIKE '%WinDivert%'"))
                using (var drivers = searcher.Get())
                {
                    foreach (ManagementObject drv in drivers)
                    {
                        var name = (string)drv["Name"];
                        var state = (string)drv["State"];

                        if (string.Equals(state, "Stopped", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        try
                        {
                            var psi = new ProcessStartInfo("sc.exe", "stop " + name)
                            {
                                UseShellExecute = false,
                                CreateNoWindow = true,
                                RedirectStandardOutput = true,
                                RedirectStandardError = true,
                            };
                            using (var proc = Process.Start(psi))
                            {
                                proc.WaitForExit(5000);
                            }

                            for (var i = 0; i < 10; i++)
                            {
                                Thread.Sleep(1000);
                                using (var checkSearcher = new ManagementObjectSearcher(
                                    "SELECT State FROM Win32_SystemDriver WHERE Name = '" + name.Replace("'", "''") + "'"))
                                using (var checkResults = checkSearcher.Get())
                                {
                                    var stillLoaded = false;
                                    foreach (ManagementObject check in checkResults)
                                    {
                                        if (!string.Equals((string)check["State"], "Stopped", StringComparison.OrdinalIgnoreCase))
                                        {
                                            stillLoaded = true;
                                        }
                                    }
                                    if (!stillLoaded)
                                    {
                                        FileLogger.Info("WinDivert drajver '" + name + "' zaustavljen pre update-a.");
                                        break;
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            FileLogger.Warn("Zaustavljanje WinDivert drajvera '" + name + "' neuspešno: " + ex.Message);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // Best-effort - WMI unavailable/query failed must not bring down the
                // update, DeleteDirectoryWithRetry's passive retry remains the
                // safety net.
                FileLogger.Warn("Provera WinDivert drajvera neuspešna: " + ex.Message);
            }
        }

        private static bool TryControlService(string serviceName, string action, out string error)
        {
            error = null;
            try
            {
                ControlService(serviceName, action);
                return true;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        /// <summary>
        /// ServerBaseUrl is OPTIONAL - the command doesn't have to originate from the agent-update
        /// flow (see ManagerCommand.cs). If it isn't filled in, it's silently
        /// skipped (there's no result to report to anyone). When it IS filled in, this is
        /// the only network call the Manager ever makes - if that fails too,
        /// there's nothing more to do here (the next heartbeat from the, hopefully,
        /// restarted service reflects the real agent_version state on the
        /// server anyway).
        /// </summary>
        private static async Task ReportResultIfConfiguredAsync(ManagerCommand command, bool success, string reason)
        {
            if (string.IsNullOrEmpty(command.ServerBaseUrl))
            {
                return;
            }

            try
            {
                await UpdateReportClient.ReportAsync(
                    command.ServerBaseUrl, command.AgentId, command.ApiKey,
                    command.FromVersion, command.ToVersion, success, reason).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Javljanje rezultata instalacije serveru neuspešno", ex);
            }
        }
    }
}
