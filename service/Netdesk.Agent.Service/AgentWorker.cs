using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using NetdeskAgent.Common;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Http;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Models;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Jobs;
using NetdeskAgent.Common.Monitoring;
using NetdeskAgent.Common.EventLogs;
using NetdeskAgent.Common.DnsLogs;
using NetdeskAgent.Common.ProcessMonitor;
using NetdeskAgent.Common.Manager;
using NetdeskAgent.Common.Update;
using NetdeskAgent.Common.Vnc;
using NetdeskAgent.Common.Consent;
using NetdeskAgent.Common.FileTransfer;

namespace NetdeskAgent.Service
{
    /// <summary>
    /// The agent's main work loop, independent of ServiceBase so it can
    /// run both in console (debug) mode and in real Windows Service mode.
    ///
    /// The complete work loop: registration (enroll), periodic heartbeat (with
    /// monitoring data), periodic inventory sync, job polling/
    /// execution, periodic event log sync, and a periodic check for a new
    /// agent version (auto-update - see NetdeskAgent.Common.Update).
    /// </summary>
    public class AgentWorker
    {
        private static readonly TimeSpan LoopTick = TimeSpan.FromSeconds(5);

        // Environment.TickCount is a 32-bit signed value - it wraps to a negative
        // value after ~24.9 days of machine uptime without a restart, which is a
        // realistic case for production machines. GetTickCount64 (available
        // since Windows Vista) is 64-bit and practically never wraps -
        // discovered live: the backend rejects the heartbeat with HTTP 400 as soon as
        // uptimeSeconds becomes negative (the zod schema requires >= 0).
        [DllImport("kernel32.dll")]
        private static extern ulong GetTickCount64();

        public async Task RunAsync(CancellationToken token)
        {
            FileLogger.Info("Netdesk Agent se pokreće (verzija " + AgentVersionInfo.Current + ")...");

            AgentSettings settings;
            try
            {
                settings = AgentSettings.Load(Paths.ConfigFile);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Ne mogu da učitam config.json - agent se zaustavlja", ex);
                return;
            }

            var state = AgentState.Load(Paths.StateFile);
            var eventLogBookmarks = EventLogBookmarks.Load(Paths.EventLogBookmarksFile);

            using (var client = new NetdeskApiClient(settings.ServerBaseUrl))
            using (var dnsCollector = new DnsQueryCollector())
            {
                // Started ONCE here (not per tick) - the capture session has to
                // run continuously so it doesn't miss queries between cycles.
                // TryStart() swallows the error internally and returns false if it fails -
                // the agent carries on normally, just without DNS logging for this run.
                dnsCollector.TryStart();

                var lastHeartbeat = DateTime.MinValue;
                var lastInventorySync = DateTime.MinValue;
                var lastJobsPoll = DateTime.MinValue;
                var lastEventLogSync = DateTime.MinValue;
                var lastDnsLogSync = DateTime.MinValue;
                var lastProcessMonitor = DateTime.MinValue;
                var lastUpdateCheck = DateTime.MinValue;

                while (!token.IsCancellationRequested)
                {
                    try
                    {
                        if (!state.IsEnrolled)
                        {
                            await EnsureEnrolledAsync(client, settings, state).ConfigureAwait(false);
                        }
                        else if ((DateTime.UtcNow - lastHeartbeat).TotalSeconds >= settings.HeartbeatIntervalSeconds)
                        {
                            await DoHeartbeatAsync(client, state).ConfigureAwait(false);
                            lastHeartbeat = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastJobsPoll).TotalSeconds >= settings.JobsPollIntervalSeconds)
                        {
                            await DoJobsPollAsync(client, state, settings).ConfigureAwait(false);
                            lastJobsPoll = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastEventLogSync).TotalSeconds >= settings.EventLogIntervalSeconds)
                        {
                            await DoEventLogSyncAsync(client, state, eventLogBookmarks).ConfigureAwait(false);
                            lastEventLogSync = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastDnsLogSync).TotalSeconds >= settings.DnsLogIntervalSeconds)
                        {
                            await DoDnsLogSyncAsync(client, state, dnsCollector).ConfigureAwait(false);
                            lastDnsLogSync = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastProcessMonitor).TotalSeconds >= settings.ProcessMonitorIntervalSeconds)
                        {
                            await DoProcessMonitorAsync(client, state, settings).ConfigureAwait(false);
                            lastProcessMonitor = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastUpdateCheck).TotalSeconds >= settings.UpdateCheckIntervalSeconds)
                        {
                            await UpdateManager.CheckAndStartUpdateAsync(client, state, AgentVersionInfo.Current).ConfigureAwait(false);
                            lastUpdateCheck = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastInventorySync).TotalSeconds >= settings.InventoryIntervalSeconds)
                        {
                            await DoInventorySyncAsync(client, state).ConfigureAwait(false);
                            lastInventorySync = DateTime.UtcNow;
                        }
                    }
                    catch (Exception ex)
                    {
                        // The loop must survive any error from a single cycle -
                        // the next tick tries again.
                        FileLogger.Error("Neočekivana greška u radnoj petlji", ex);
                    }

                    try
                    {
                        await Task.Delay(LoopTick, token).ConfigureAwait(false);
                    }
                    catch (TaskCanceledException)
                    {
                        // OnStop called Cancel - a normal exit from the loop.
                    }
                }
            }

            FileLogger.Info("Netdesk Agent zaustavljen.");
        }

        private static async Task EnsureEnrolledAsync(NetdeskApiClient client, AgentSettings settings, AgentState state)
        {
            if (string.IsNullOrWhiteSpace(settings.EnrollToken))
            {
                FileLogger.Warn("Agent nije registrovan, a EnrollToken nije podešen u config.json - preskačem enroll.");
                return;
            }

            try
            {
                // The same WMI collection as the inventory sync (HardwareCollector.CollectOs) -
                // avoids querying Win32_OperatingSystem twice with two different
                // helpers for the same data.
                var os = HardwareCollector.CollectOs();

                var request = new EnrollRequest
                {
                    Hostname = Environment.MachineName,
                    OsCaption = os != null ? os.Caption : null,
                    OsVersion = os != null ? os.Version : null,
                    OsBuild = os != null ? os.Build : null,
                    AgentVersion = AgentVersionInfo.Current,
                };

                var response = await client.EnrollAsync(settings.EnrollToken, request).ConfigureAwait(false);

                state.AgentId = response.AgentId;
                state.ApiKey = response.ApiKey;
                state.Save(Paths.StateFile);

                FileLogger.Info("Agent uspešno registrovan. AgentId=" + response.AgentId);
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("Enrollment odbijen od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Enrollment neuspešan", ex);
            }
        }

        private static async Task DoHeartbeatAsync(NetdeskApiClient client, AgentState state)
        {
            try
            {
                var request = new HeartbeatRequest
                {
                    Hostname = Environment.MachineName,
                    AgentVersion = AgentVersionInfo.Current,
                    UptimeSeconds = (int)(GetTickCount64() / 1000),
                    Monitoring = MonitoringCollector.Collect(),
                };

                var response = await client.HeartbeatAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);

                if (response.Agent != null)
                {
                    state.ProcessKillExempt = response.Agent.ProcessKillExempt;
                }

                FileLogger.Info("Heartbeat OK. Status=" + (response.Agent != null ? response.Agent.Status : "?"));
            }
            catch (NetdeskApiException apiEx) when (apiEx.StatusCode == 403)
            {
                // The agent is revoked on the server or the apiKey is invalid - there's no point
                // in continuing to try with the same credentials without human intervention.
                FileLogger.Error("Server je odbio heartbeat (403) - agent je verovatno povučen (revoked).", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Heartbeat neuspešan", ex);
            }
        }

        private static async Task DoEventLogSyncAsync(NetdeskApiClient client, AgentState state, EventLogBookmarks bookmarks)
        {
            try
            {
                var entries = EventLogCollector.Collect(bookmarks);
                if (entries.Count == 0)
                {
                    return;
                }

                var ip = HardwareCollector.GetPrimaryIPv4();
                if (string.IsNullOrEmpty(ip))
                {
                    FileLogger.Warn("Nije pronađena IPv4 adresa - event log sync se preskače ovog ciklusa.");
                    return;
                }

                // A deliberately light request - only ip + eventLogs, without the full hardware
                // snapshot. The backend updates metadata with merge (patch)
                // semantics, not overwrite, so omitted fields stay untouched
                // (see the backend memory on patchMetadataForIpEntry).
                var request = new InventoryRequest { Ip = ip, EventLogs = entries };
                await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);

                bookmarks.Save(Paths.EventLogBookmarksFile);
                FileLogger.Info("Event log sync OK. Poslato " + entries.Count + " unosa.");
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("Event log sync odbijen od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Event log sync neuspešan", ex);
            }
        }

        private static async Task DoDnsLogSyncAsync(NetdeskApiClient client, AgentState state, DnsQueryCollector dnsCollector)
        {
            try
            {
                var entries = dnsCollector.Snapshot();
                if (entries.Count == 0)
                {
                    return;
                }

                var ip = HardwareCollector.GetPrimaryIPv4();
                if (string.IsNullOrEmpty(ip))
                {
                    FileLogger.Warn("Nije pronađena IPv4 adresa - DNS log sync se preskače ovog ciklusa.");
                    return;
                }

                // The same pattern as DoEventLogSyncAsync - a light request, only ip +
                // dnsQueries, the merge (patch) semantics on the backend don't touch
                // the other metadata.
                var request = new InventoryRequest { Ip = ip, DnsQueries = entries };
                await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);

                FileLogger.Info("DNS log sync OK. Poslato " + entries.Count + " domena.");
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("DNS log sync odbijen od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("DNS log sync neuspešan", ex);
            }
        }

        private static async Task DoProcessMonitorAsync(NetdeskApiClient client, AgentState state, AgentSettings settings)
        {
            try
            {
                // state.ProcessKillExempt - the server-side "whitelist" refreshed on
                // every heartbeat (see DoHeartbeatAsync) - this machine still
                // detects/logs, but nothing is EVER killed on it, regardless of
                // the global settings.KillWatchedProcesses.
                var killMatches = settings.KillWatchedProcesses && !state.ProcessKillExempt;
                var entries = ProcessWatchCollector.Scan(settings.WatchedProcessNames, killMatches);
                if (entries.Count == 0)
                {
                    return;
                }

                var ip = HardwareCollector.GetPrimaryIPv4();
                if (string.IsNullOrEmpty(ip))
                {
                    FileLogger.Warn("Nije pronađena IPv4 adresa - process monitor sync se preskače ovog ciklusa.");
                    return;
                }

                // The same pattern as DoDnsLogSyncAsync - a light request, only ip +
                // processDetections, the merge (patch) semantics on the backend don't touch
                // the other metadata.
                var request = new InventoryRequest { Ip = ip, ProcessDetections = entries };
                await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);

                // Process names directly in the log line (not just a count) - immediately visible
                // in agent.log without waiting for the DB/frontend, given the urgency of this
                // particular security scenario (a portable remote-access tool running).
                // The individual "killed suspicious process"/"failed kill attempt"
                // lines were already written per instance by ProcessWatchCollector.Scan() -
                // this is just the cycle's summary.
                var names = string.Join(", ", entries.Select(e => e.ProcessName));
                var exemptNote = settings.KillWatchedProcesses && state.ProcessKillExempt
                    ? " (ubijanje preskočeno - ova mašina je na whitelist-i)"
                    : "";
                FileLogger.Info("Process monitor: detektovan(i) sa watchlist-e - " + names + "." + exemptNote);
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("Process monitor sync odbijen od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Process monitor sync neuspešan", ex);
            }
        }

        private static async Task DoInventorySyncAsync(NetdeskApiClient client, AgentState state)
        {
            try
            {
                // WMI/registry collection is synchronous and blocks this thread while it runs
                // (including the slower COM search for available patches) - that's
                // acceptable here because this is a dedicated background thread, not a UI/
                // dispatcher thread, and the inventory sync is called rarely
                // (InventoryIntervalSeconds, 1h by default).
                var request = InventoryCollector.Collect(Environment.MachineName, department: null, includeAvailableUpdates: true, serverBaseUrl: client.BaseUrl);
                if (request == null)
                {
                    // InventoryCollector has already logged the reason (e.g. no IPv4 address).
                    return;
                }

                var response = await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);
                FileLogger.Info("Inventory sync OK. ipEntryId=" + response.IpEntryId);
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("Inventory sync odbijen od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Inventory sync neuspešan", ex);
            }
        }

        private static async Task DoJobsPollAsync(NetdeskApiClient client, AgentState state, AgentSettings settings)
        {
            JobsResponse jobsResponse;

            try
            {
                jobsResponse = await client.GetJobsAsync(state.AgentId, state.ApiKey).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Preuzimanje komandi neuspešno", ex);
                return;
            }

            if (jobsResponse?.Jobs == null || jobsResponse.Jobs.Count == 0)
            {
                return;
            }

            foreach (var job in jobsResponse.Jobs)
            {
                await ProcessJobAsync(client, state, settings, job).ConfigureAwait(false);
            }
        }

        private static async Task ProcessJobAsync(NetdeskApiClient client, AgentState state, AgentSettings settings, JobItem job)
        {
            FileLogger.Info("Izvršavam komandu #" + job.Id + " (" + job.CommandType + ")...");

            if (IsNetdeskAgentServiceControl(job.CommandType, job.Payload))
            {
                // NetdeskAgent must not (re)start itself through JobExecutor
                // (synchronously on the same loop that has to report the result to the
                // server - the service would shut down before it could report
                // success, and the job would stay stuck on "sent" forever). Instead,
                // hand it off to NetdeskAgentManager (a separate, persistent service)
                // via the mailbox and IMMEDIATELY report the dispatch, not the completion -
                // the same fire-and-forget shape as start_vnc_bridge below. Two
                // paths lead here: the explicit start_netdesk_agent/
                // stop_netdesk_agent/restart_netdesk_agent commands (the main,
                // recommended path for manual control), OR the generic
                // restart_service/start_service/stop_service with
                // payload.serviceName="NetdeskAgent" (defense in depth, in case
                // someone sends a generic command at this target anyway).
                // JobExecutor.ControlService still works unchanged for EVERY
                // OTHER service name (e.g. Spooler).
                var serviceAction = ServiceActionFor(job.CommandType);
                var command = new ManagerCommand
                {
                    Action = "control_service",
                    ServiceName = "NetdeskAgent",
                    ServiceAction = serviceAction,
                };

                string failureReason;
                var dispatched = ManagerCommandClient.TrySend(command, out failureReason);

                await ReportJobResultAsync(client, state, job.Id, new JobExecutor.ExecutionResult
                {
                    Success = dispatched,
                    ExitCode = dispatched ? 0 : 1,
                    Output = dispatched ? "Prosleđeno NetdeskAgentManager-u (" + serviceAction + ")." : null,
                    ErrorOutput = dispatched ? null : failureReason,
                    DurationMs = 0,
                }).ConfigureAwait(false);
                return;
            }

            if (job.CommandType == "force_reinstall_agent")
            {
                // Doesn't go through JobExecutor - it needs NetdeskApiClient/AgentState
                // access (the same reason as collect_inventory/refresh_software_list
                // below), and the update handoff itself (download→verify→send to
                // the Manager) is async.
                var forceResult = await RunForceReinstallJobAsync(client, state, job.Payload).ConfigureAwait(false);
                await ReportJobResultAsync(client, state, job.Id, forceResult).ConfigureAwait(false);
                return;
            }

            if (job.CommandType == "start_vnc_bridge")
            {
                // Ban on unsolicited screen capture: before the bridge
                // comes up, the user at the workstation MUST explicitly
                // approve the session (ConsentPrompt). The whole flow (the consent that blocks
                // until the timeout + bridges that last the whole session) runs
                // fire-and-forget so it doesn't stall the poll loop - only the dispatch is
                // reported here right away, not the completion.
                var sessionId = ExtractSessionId(job.Payload);
                RunVncSessionWithConsentFireAndForget(client, state, settings, sessionId);

                await ReportJobResultAsync(client, state, job.Id, new JobExecutor.ExecutionResult
                {
                    Success = true,
                    ExitCode = 0,
                    Output = "VNC zahtev primljen - čeka se pristanak korisnika na radnoj stanici.",
                    DurationMs = 0,
                }).ConfigureAwait(false);
                return;
            }

            JobExecutor.ExecutionResult result;

            if (job.CommandType == "collect_inventory" || job.CommandType == "refresh_software_list")
            {
                // These two commands don't go through JobExecutor - they need
                // NetdeskApiClient/AgentState access that the executor deliberately doesn't have
                // (it keeps OS-level commands and the network/state layer separate).
                result = await RunInventoryJobAsync(client, state, job.CommandType).ConfigureAwait(false);
            }
            else
            {
                result = JobExecutor.Execute(job.CommandType, job.Payload);
            }

            FileLogger.Info(
                "Komanda #" + job.Id + " završena. Success=" + result.Success + " ExitCode=" + result.ExitCode);

            await ReportJobResultAsync(client, state, job.Id, result).ConfigureAwait(false);
        }

        private static long ExtractSessionId(Newtonsoft.Json.Linq.JObject payload)
        {
            return payload != null ? (long)payload["sessionId"] : 0;
        }

        // Shows the consent dialog to the user at the workstation, reports the
        // outcome to the backend, then the bridge ONLY if approved. async void because it's
        // fire-and-forget from the poll loop (see the start_vnc_bridge handler) -
        // ConsentPrompt.Ask blocks until the timeout and must not hold up polling.
        private static async void RunVncSessionWithConsentFireAndForget(
            NetdeskApiClient client, AgentState state, AgentSettings settings, long sessionId)
        {
            try
            {
                // IP + MAC of the agent's (user's) workstation for the audit trail.
                string agentIp = null, agentMac = null;
                try
                {
                    agentIp = HardwareCollector.GetPrimaryIPv4();
                    agentMac = HardwareCollector.CollectNics()
                        .Select(n => n.Mac)
                        .FirstOrDefault(m => !string.IsNullOrEmpty(m));
                }
                catch (Exception ex)
                {
                    FileLogger.Warn("VNC sesija #" + sessionId + " - prikupljanje IP/MAC agenta neuspešno: " + ex.Message);
                }

                var consent = ConsentPrompt.Ask(settings.VncConsentTimeoutSeconds);

                try
                {
                    await client.ReportVncConsentAsync(
                        state.AgentId, state.ApiKey, sessionId,
                        consent.ConsentStatus, consent.ApproverUsername, agentIp, agentMac)
                        .ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - prijava pristanka backend-u neuspešna", ex);
                    // Without a confirmed 'granted' on the backend, the relay rejects the
                    // bridge anyway (defense in depth) - don't bring it up from this side either.
                    return;
                }

                if (consent.ConsentStatus != "granted")
                {
                    FileLogger.Info(
                        "VNC sesija #" + sessionId + " - pristanak nije dat (" + consent.ConsentStatus + "), most se ne diže.");
                    return;
                }

                // From here on identical to the old flow: two independent channels (the VNC bridge and
                // file transfer), each on its own CancellationTokenSource.
                var cts = new CancellationTokenSource();
                RunVncBridgeFireAndForget(sessionId, settings, state, cts.Token);

                var fileTransferCts = new CancellationTokenSource();
                RunFileTransferBridgeFireAndForget(sessionId, settings, state, fileTransferCts.Token);
            }
            catch (Exception ex)
            {
                FileLogger.Error("VNC sesija #" + sessionId + " - neočekivana greška u toku pristanka", ex);
            }
        }

        // Task.Run(...) started here intentionally isn't awaited by the caller
        // (it would block the poll loop for the whole session) - this wrapper
        // just makes that explicit and logs anything VncBridge.RunAsync itself
        // didn't already catch, instead of leaving an unobserved task exception.
        private static async void RunVncBridgeFireAndForget(
            long sessionId, AgentSettings settings, AgentState state, CancellationToken token)
        {
            try
            {
                await VncBridge.RunAsync(
                    sessionId, settings.ServerBaseUrl, state.AgentId, state.ApiKey, settings.VncLocalPort, token)
                    .ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("VNC sesija #" + sessionId + " - neočekivana greška u mostu", ex);
            }
        }

        // The same fire-and-forget reason as RunVncBridgeFireAndForget above -
        // FileTransferBridge.RunAsync doesn't need a local TCP port (it works directly
        // with the file system, it doesn't proxy to a local service like VncBridge).
        private static async void RunFileTransferBridgeFireAndForget(
            long sessionId, AgentSettings settings, AgentState state, CancellationToken token)
        {
            try
            {
                await FileTransferBridge.RunAsync(
                    sessionId, settings.ServerBaseUrl, state.AgentId, state.ApiKey, token)
                    .ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Fajl-transfer sesija #" + sessionId + " - neočekivana greška u mostu", ex);
            }
        }

        private static async Task ReportJobResultAsync(
            NetdeskApiClient client, AgentState state, long jobId, JobExecutor.ExecutionResult result)
        {
            try
            {
                var reportRequest = new JobResultRequest
                {
                    ExitCode = result.ExitCode,
                    Output = result.Output,
                    ErrorOutput = result.ErrorOutput,
                    DurationMs = result.DurationMs,
                    Success = result.Success,
                };

                await client.SubmitJobResultAsync(state.AgentId, state.ApiKey, jobId, reportRequest).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Slanje rezultata za komandu #" + jobId + " neuspešno", ex);
            }
        }

        private static async Task<JobExecutor.ExecutionResult> RunInventoryJobAsync(
            NetdeskApiClient client, AgentState state, string commandType)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                var request = InventoryCollector.Collect(
                    Environment.MachineName,
                    department: null,
                    includeAvailableUpdates: commandType == "collect_inventory",
                    serverBaseUrl: client.BaseUrl);

                if (request == null)
                {
                    sw.Stop();
                    return new JobExecutor.ExecutionResult
                    {
                        Success = false,
                        ExitCode = -1,
                        ErrorOutput = "Nije pronađena IPv4 adresa.",
                        DurationMs = sw.ElapsedMilliseconds,
                    };
                }

                await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);
                sw.Stop();

                return new JobExecutor.ExecutionResult
                {
                    Success = true,
                    ExitCode = 0,
                    Output = "Inventar sinhronizovan.",
                    DurationMs = sw.ElapsedMilliseconds,
                };
            }
            catch (Exception ex)
            {
                sw.Stop();
                return new JobExecutor.ExecutionResult
                {
                    Success = false,
                    ExitCode = -1,
                    ErrorOutput = ex.Message,
                    DurationMs = sw.ElapsedMilliseconds,
                };
            }
        }

        private static bool IsNetdeskAgentServiceControl(string commandType, Newtonsoft.Json.Linq.JObject payload)
        {
            if (commandType == "start_netdesk_agent" || commandType == "stop_netdesk_agent" ||
                commandType == "restart_netdesk_agent")
            {
                return true;
            }

            if (commandType != "restart_service" && commandType != "start_service" && commandType != "stop_service")
            {
                return false;
            }

            var serviceName = payload != null ? (string)payload["serviceName"] : null;
            return string.Equals((serviceName ?? string.Empty).Trim(), "NetdeskAgent", StringComparison.OrdinalIgnoreCase);
        }

        private static string ServiceActionFor(string commandType)
        {
            switch (commandType)
            {
                case "restart_service":
                case "restart_netdesk_agent":
                    return "restart";
                case "start_service":
                case "start_netdesk_agent":
                    return "start";
                case "stop_service":
                case "stop_netdesk_agent":
                    return "stop";
                default:
                    return null;
            }
        }

        /// <summary>
        /// force_reinstall_agent job - the admin explicitly picked the EXACT
        /// release (releaseId/version/sha256 arrive in the payload from
        /// AgentReleasesView.vue), so it's installed WITHOUT the isNewerVersion check
        /// (it can "reinstall" the same version too - repairing a damaged
        /// install). See UpdateManager.ForceInstallAsync.
        /// </summary>
        private static async Task<JobExecutor.ExecutionResult> RunForceReinstallJobAsync(
            NetdeskApiClient client, AgentState state, Newtonsoft.Json.Linq.JObject payload)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();

            try
            {
                var releaseId = payload != null ? (long)payload["releaseId"] : 0;
                var version = payload != null ? (string)payload["version"] : null;
                var sha256 = payload != null ? (string)payload["sha256"] : null;

                if (releaseId <= 0 || string.IsNullOrEmpty(version) || string.IsNullOrEmpty(sha256))
                {
                    sw.Stop();
                    return new JobExecutor.ExecutionResult
                    {
                        Success = false,
                        ExitCode = -1,
                        ErrorOutput = "Nedostaju obavezna polja (releaseId/version/sha256) u payload-u.",
                        DurationMs = sw.ElapsedMilliseconds,
                    };
                }

                await UpdateManager.ForceInstallAsync(client, state, AgentVersionInfo.Current, releaseId, version, sha256)
                    .ConfigureAwait(false);
                sw.Stop();

                return new JobExecutor.ExecutionResult
                {
                    Success = true,
                    ExitCode = 0,
                    Output = "Reinstalacija verzije " + version + " prosleđena NetdeskAgentManager-u.",
                    DurationMs = sw.ElapsedMilliseconds,
                };
            }
            catch (Exception ex)
            {
                sw.Stop();
                FileLogger.Error("Forsirana reinstalacija neuspešna", ex);
                return new JobExecutor.ExecutionResult
                {
                    Success = false,
                    ExitCode = -1,
                    ErrorOutput = ex.Message,
                    DurationMs = sw.ElapsedMilliseconds,
                };
            }
        }
    }
}
