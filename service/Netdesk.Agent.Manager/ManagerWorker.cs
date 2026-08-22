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
    /// Glavna radna petlja - proverava mailbox (Paths.ManagerCommandFile) na
    /// svaki tick, ali se budi RANIJE ako NetdeskAgentManagerService.
    /// OnCustomCommand signalizira WakeEvent (nizak latency put), tako da
    /// periodični tick ostaje čisto safety-net (custom command signal
    /// izgubljen npr. jer je Manager bio ugašen kad je komanda upisana).
    /// </summary>
    public class ManagerWorker
    {
        private static readonly TimeSpan LoopTick = TimeSpan.FromSeconds(5);
        private static readonly TimeSpan ServiceControlTimeout = TimeSpan.FromSeconds(30);

        private readonly object _executeLock = new object();

        // Novi, nezavisni HTTP kanal (enroll/heartbeat/job-poll ka backend-u,
        // NE mailbox) - _client ostaje null (kanal se tiho preskače na
        // svakom tick-u) ako config.json ne postoji ili je neispravan.
        // Mailbox put ispod (ProcessMailboxIfPresentAsync) radi NEZAVISNO od
        // ovoga i nikad se ne gasi zbog problema sa ovim kanalom - to je
        // čitava poenta ove izmene (Manager ostaje upravljiv preko mailbox-a
        // čak i ako HTTP kanal nikad ne proradi na nekoj mašini).
        private ManagerConfig _config;
        private ManagerState _state;
        private ManagerApiClient _client;

        public AutoResetEvent WakeEvent { get; } = new AutoResetEvent(false);

        public async Task RunAsync(CancellationToken token)
        {
            FileLogger.Info("Netdesk Agent Manager se pokreće...");

            InitializeHttpChannel();

            // Proveri mailbox JEDNOM pre ulaska u petlju - hvata slučaj
            // "komanda stigla dok je Manager bio ugašen".
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
                    // Petlja mora da preživi bilo koju grešku iz jednog ciklusa -
                    // sledeći tick pokušava ponovo.
                    FileLogger.Error("Neočekivana greška u Manager radnoj petlji", ex);
                }
            }

            _client?.Dispose();
            FileLogger.Info("Netdesk Agent Manager zaustavljen.");
        }

        /// <summary>
        /// Best-effort - config.json ne mora postojati (mašina još nije
        /// dobila ažuriran bootstrap preset, ili admin svesno ne želi novi
        /// kanal na ovoj mašini) - u tom slučaju _client ostaje null i
        /// gornja petlja tiho preskače sve HTTP korake zauvek (dok se servis
        /// sledeći put ne pokrene, npr. posle instaliranja config.json-a).
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
        /// Izvršavanje NIJE odvojenim zaključavanjem serijalizovano protiv
        /// ProcessMailboxIfPresentAsync-a - namerno nepotrebno, obe petlje
        /// (mailbox tick gore i ovaj poll) su deo ISTOG sekvencijalnog
        /// RunAsync tick-a na jednoj async petlji (NetdeskAgentManagerService.
        /// OnCustomCommand samo signalizira WakeEvent, ne pokreće posebnu
        /// obradu) - stvarna konkurentnost između dva puta ne postoji.
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
                // Servis nije instaliran na ovoj mašini, ili upit nije uspeo -
                // "Unknown" je ispravan odgovor u oba slučaja, ne greška koja
                // sme da obori ceo heartbeat.
                return "Unknown";
            }
        }

        /// <summary>
        /// ServiceController nema "startup type" svojstvo (samo run-time
        /// status) - čita se direktno iz registry Start DWORD vrednosti,
        /// isti izvor koji SCM sam koristi (2=Automatic, 3=Manual,
        /// 4=Disabled; 0/1=Boot/System drajveri, ne primenjivo na obične
        /// servise poput NetdeskAgent-a).
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
        /// Menja startup tip preko sc.exe (ne P/Invoke ChangeServiceConfig) -
        /// retka, admin-pokrenuta akcija, ne hot path; sc.exe je standardan,
        /// auditable sysadmin alat, isti nivo poverenja kao InstallUtil.exe
        /// koji se već koristi u instalacionim koracima.
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
        /// install_update sa novog kanala - za razliku od mailbox install_files
        /// (gde Agent VEĆ preuzme/raspakuje paket pre nego što preda
        /// StagingDir), ovde Manager SAM preuzima paket (sopstvenim
        /// kredencijalima - nikad Agent-ovim, videti ManagerApiClient.cs), pa
        /// tek onda poziva postojeći InstallFilesAsync sa sintetizovanim,
        /// isključivo-u-memoriji ManagerCommand objektom (nikad zapisan u
        /// mailbox fajl).
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
                    // Isti razlog kao UpdateManager.cs (Agent strana) - WebRtcBridge
                    // ume da drži zaključane fajlove duže od običnog driver-unload
                    // lag-a. Manager ovde i dalje samo "zna ime za ubijanje", ne
                    // zašto - isti princip kao mailbox put.
                    KillProcessNames = new[] { "Netdesk.Agent.WebRtcBridge" },
                    // ServerBaseUrl namerno prazan - ReportResultIfConfiguredAsync
                    // (unutar InstallFilesAsync) zato tiho preskače UpdateReportClient
                    // poziv, rezultat se javlja OVDE preko novog kanala umesto toga.
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
        /// "Gde ovaj servis stvarno živi" po SCM-u samom (ImagePath) - jedina
        /// istina koja nikad ne može biti zastarela u odnosu na ono što je
        /// stvarno pokrenuto, ne zahteva admin unos, i NIJE "komunikacija sa
        /// Agent procesom" (čitanje OS-održavane registry vrednosti, ne IPC
        /// sa samim procesom).
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

                // ImagePath je obično navodnicima obavijena putanja, opciono
                // praćena argumentima (npr. "\"C:\Program Files\...\X.exe\" -arg") -
                // uzima se samo prvi navodnicima-obavijeni (ili prvi
                // razmakom-odvojeni, ako nema navodnika) token.
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
        /// Single-shot: fajl se ODMAH briše čim je pročitan (pre izvršavanja),
        /// sprečava duplo izvršavanje ako i tick i WakeEvent stignu blizu.
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
        /// stop servisa → obriši InstallDir POTPUNO → kopiraj StagingDir u
        /// InstallDir (rekurzivno, DirectorySync - ispravlja stari Updater
        /// bug sa amd64\/x86\ podfolderima, i sad ima retry na zaključane
        /// fajlove - videti DirectorySync komentar) → start servisa.
        /// GARANCIJA: fajlovi se NIKAD ne diraju ako stop nije uspeo -
        /// proverava se eksplicitno PRE bilo kakvog brisanja/kopiranja.
        ///
        /// NEMA backup-a/rollback-a - namerna pojednostavitev posle uživo
        /// incidenta gde je i sam rollback (kopiranje unazad) pao na istom
        /// razlogu kao originalni update (zaključan WinDivert64.sys),
        /// ostavljajući mašinu u konfuznom "i update i rollback neuspešni"
        /// stanju. Prost "obriši pa instaliraj" nema tu drugu tačku otkaza -
        /// na grešku, InstallDir može ostati delimično popunjen/prazan,
        /// servis ostaje zaustavljen, i to je čitljivo/predvidivo stanje za
        /// sledeći pokušaj (novi update ili force_reinstall_agent), ne
        /// skriveno "izgleda oporavljeno ali nije" stanje. InstallDir/
        /// StagingDir/ServiceName su proizvoljne putanje/naziv - ovaj metod
        /// nije vezan za NetdeskAgent specifično. Config.json NIJE dirnut u
        /// trenutnoj (NetdeskAgent) upotrebi - živi van InstallDir-a.
        /// </summary>
        /// <summary>
        /// Vraća InstallResult (umesto void) da pozivalac sa NOVOG kanala
        /// (InstallUpdateFromServerAsync) može da javi ishod preko
        /// manager_jobs rezultata - stari mailbox pozivalac
        /// (ProcessMailboxIfPresentAsync) i dalje samo odbacuje povratnu
        /// vrednost (ReportResultIfConfiguredAsync ispod ostaje NJEGOV jedini
        /// put javljanja, nepromenjen).
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
                KillProcesses(command.KillProcessNames);
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
        /// Nasilno ubija sve procese sa datim nazivima (bez .exe) - best-effort,
        /// jedan proces koji ne uspe da se ubije (već izašao, access denied,
        /// itd.) ne sme da obori ostatak install koraka. Namerno se poziva PRE
        /// brisanja/kopiranja fajlova, ne posle - ovi procesi mogu držati
        /// zaključane baš one fajlove koje DirectorySync sledeći treba da
        /// obriše/prepiše (vidi ManagerCommand.KillProcessNames za pun
        /// kontekst zašto ovo uopšte postoji).
        /// </summary>
        private static void KillProcesses(string[] processNames)
        {
            if (processNames == null || processNames.Length == 0) return;

            foreach (var name in processNames)
            {
                if (string.IsNullOrWhiteSpace(name)) continue;

                Process[] matches;
                try
                {
                    matches = Process.GetProcessesByName(name);
                }
                catch (Exception ex)
                {
                    FileLogger.Warn("GetProcessesByName('" + name + "') neuspešno: " + ex.Message);
                    continue;
                }

                foreach (var process in matches)
                {
                    try
                    {
                        process.Kill();
                        process.WaitForExit(5000);
                        FileLogger.Info("Proces '" + name + "' (PID " + process.Id + ") ubijen pre update-a.");
                    }
                    catch (Exception ex)
                    {
                        FileLogger.Warn(
                            "Ubijanje procesa '" + name + "' (PID " + process.Id + ") neuspešno: " + ex.Message);
                    }
                    finally
                    {
                        process.Dispose();
                    }
                }
            }
        }

        /// <summary>
        /// Aktivno zaustavlja WinDivert kernel drajver (WinDivert64.sys, deo
        /// DnsQueryCollector-a - vidi Netdesk.Agent.Common/DnsLogs/WinDivertInterop.cs)
        /// pre brisanja/kopiranja install foldera - ista tehnika kao
        /// "Prinudno zaustavi WinDivert drajver" PowerShell preset
        /// (powershellPresets.js), portovana ovde da update preko Manager-a
        /// ne mora da se oslanja SAMO na pasivni retry u
        /// DirectorySync.DeleteDirectoryWithRetry (8 pokušaja/750ms, ~6s) -
        /// taj retry i dalje ostaje kao safety-net ako je drajver zaključan
        /// iz nekog DRUGOG razloga, ne samo sporog unload-a.
        ///
        /// Ne oslanja se na hardkodovan naziv servisa ("WinDivert" nije deo
        /// zvaničnog ugovora biblioteke) - nalazi drajver PO PUTANJI preko
        /// Win32_SystemDriver (WMI, kernel-mode drajveri/servisi). Best-effort:
        /// ako WMI upit ili sc stop ne uspeju, samo se loguje upozorenje -
        /// pasivni retry u DeleteDirectoryWithRetry ostaje poslednja linija
        /// odbrane, ne sme da obori ceo update.
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
                // Best-effort - WMI nedostupan/upit neuspešan ne sme da obori
                // update, DeleteDirectoryWithRetry-ev pasivni retry ostaje
                // safety-net.
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
        /// ServerBaseUrl je OPCIONO - komanda ne mora poticati iz agent-update
        /// flow-a (videti ManagerCommand.cs). Ako nije popunjeno, tiho se
        /// preskače (nema rezultat kome bi se javio). Kad JE popunjeno, ovo je
        /// jedini mrežni poziv koji Manager ikad pravi - ako i on ne uspe,
        /// nema šta više da se uradi ovde (sledeći heartbeat sa, nadamo se,
        /// ponovo pokrenutog servisa ionako odražava stvarno stanje
        /// agent_version na serveru).
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
