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
#if NETDESK_WEBRTC_CAPABLE
using System.IO;
using NetdeskAgent.Common.Webrtc;
#endif

namespace NetdeskAgent.Service
{
    /// <summary>
    /// Glavna radna petlja agenta, nezavisna od ServiceBase da bi mogla da se
    /// pokrene i u konzolnom (debug) i u pravom Windows Service modu.
    ///
    /// Kompletna radna petlja: registracija (enroll), periodičan heartbeat (sa
    /// monitoring podacima), periodičan inventory sync, job polling/
    /// izvršavanje, periodičan event log sync, i periodična provera nove
    /// verzije agenta (auto-update - videti NetdeskAgent.Common.Update).
    /// </summary>
    public class AgentWorker
    {
        private static readonly TimeSpan LoopTick = TimeSpan.FromSeconds(5);

        // Environment.TickCount je 32-bit signed - prelama se u negativnu
        // vrednost posle ~24.9 dana rada mašine bez restarta, što je
        // realističan slučaj za produkcione mašine. GetTickCount64 (dostupan
        // od Windows Vista) je 64-bit i praktično se nikad ne prelama -
        // otkriveno uživo: backend odbija heartbeat sa HTTP 400 čim
        // uptimeSeconds postane negativan (zod schema zahteva >= 0).
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
                // Pokreće se JEDNOM ovde (ne po tick-u) - ETW sesija mora da
                // radi kontinuirano da ne propusti upite između ciklusa.
                // TryStart() interno guta grešku i vraća false ako otkaže -
                // agent nastavlja normalno, samo bez DNS logovanja ovog rada.
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
                        // Petlja mora da preživi bilo koju grešku iz jednog ciklusa -
                        // sledeći tick pokušava ponovo.
                        FileLogger.Error("Neočekivana greška u radnoj petlji", ex);
                    }

                    try
                    {
                        await Task.Delay(LoopTick, token).ConfigureAwait(false);
                    }
                    catch (TaskCanceledException)
                    {
                        // OnStop je pozvao Cancel - normalan izlaz iz petlje.
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
                // Ista WMI kolekcija kao inventory sync (HardwareCollector.CollectOs) -
                // izbegava duplo query-ovanje Win32_OperatingSystem sa dva različita
                // helper-a za isti podatak.
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
                // Agent je revoked na serveru ili je apiKey nevažeći - nema smisla
                // dalje pokušavati sa istim kredencijalima bez ljudske intervencije.
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

                // Namerno lagan zahtev - samo ip + eventLogs, bez punog hardverskog
                // snapshot-a. Backend meta-podatke ažurira preko merge (patch)
                // semantike, ne overwrite-a, pa izostavljena polja ostaju netaknuta
                // (videti backend memoriju o patchMetadataForIpEntry).
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

                // Isti obrazac kao DoEventLogSyncAsync - lagan zahtev, samo ip +
                // dnsQueries, merge (patch) semantika na backend-u ne dira
                // ostale metapodatke.
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
                // state.ProcessKillExempt - server-side "whitelist" osvežena pri
                // svakom heartbeat-u (videti DoHeartbeatAsync) - ova mašina i dalje
                // detektuje/loguje, ali se NIKAD ne ubija na njoj, bez obzira na
                // globalni settings.KillWatchedProcesses.
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

                // Isti obrazac kao DoDnsLogSyncAsync - lagan zahtev, samo ip +
                // processDetections, merge (patch) semantika na backend-u ne dira
                // ostale metapodatke.
                var request = new InventoryRequest { Ip = ip, ProcessDetections = entries };
                await client.PostInventoryAsync(state.AgentId, state.ApiKey, request).ConfigureAwait(false);

                // Imena procesa direktno u log liniju (ne samo broj) - odmah vidljivo
                // u agent.log bez čekanja na DB/frontend, s obzirom na hitnost ovog
                // konkretnog security scenarija (portable remote-access alat u radu).
                // Pojedinačne "ubijen sumnjiv proces"/"neuspešan pokušaj ubijanja"
                // linije već je ispisao ProcessWatchCollector.Scan() po instanci -
                // ovo je samo sumarni pregled ciklusa.
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
                // WMI/registry kolekcija je sinhrona i blokira ovu nit dok traje
                // (uključujući sporiju COM pretragu za dostupnim zakrpama) - to je
                // prihvatljivo ovde jer je ovo posvećena background nit, ne UI/
                // dispatcher nit, a inventory sync se poziva retko
                // (InventoryIntervalSeconds, podrazumevano 1h).
                var request = InventoryCollector.Collect(Environment.MachineName, department: null, includeAvailableUpdates: true);
                if (request == null)
                {
                    // InventoryCollector je već ulogovao razlog (npr. nema IPv4 adrese).
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
                // NetdeskAgent ne sme sam sebe da (re)startuje kroz JobExecutor
                // (sinhrono na istoj petlji koja treba da prijavi rezultat
                // serveru - servis bi se ugasio pre nego što stigne da javi
                // uspeh, job bi ostao zauvek zaglavljen na "sent"). Umesto
                // toga, prosledi NetdeskAgentManager-u (odvojen, trajan servis)
                // preko mailbox-a i ODMAH prijavi dispatch, ne completion -
                // isti fire-and-forget oblik kao start_vnc_bridge ispod. Dva
                // puta dovode ovde: eksplicitne start_netdesk_agent/
                // stop_netdesk_agent/restart_netdesk_agent komande (glavni,
                // preporučen put za ručno upravljanje), ILI generičke
                // restart_service/start_service/stop_service sa
                // payload.serviceName="NetdeskAgent" (odbrana u dubinu, ako
                // neko ipak pošalje generičku komandu na ovaj cilj).
                // JobExecutor.ControlService i dalje radi nepromenjeno za SVAKI
                // DRUGI naziv servisa (npr. Spooler).
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
                // Ne ide kroz JobExecutor - treba mu NetdeskApiClient/AgentState
                // pristup (isti razlog kao collect_inventory/refresh_software_list
                // ispod), i sam update handoff (preuzmi→verifikuj→pošalji
                // Manager-u) je async.
                var forceResult = await RunForceReinstallJobAsync(client, state, job.Payload).ConfigureAwait(false);
                await ReportJobResultAsync(client, state, job.Id, forceResult).ConfigureAwait(false);
                return;
            }

            if (job.CommandType == "start_vnc_bridge")
            {
                // Ne ide kroz JobExecutor (blokiralo bi poll petlju za celo
                // trajanje sesije) - fire-and-forget na sopstvenom
                // CancellationTokenSource-u, ne servisnom token-u (sesija se
                // ionako gasi kad WS/TCP veza padne na jednoj od strana, vidi
                // VncBridge.RunAsync).
                var sessionId = ExtractSessionId(job.Payload);
                var cts = new CancellationTokenSource();
                RunVncBridgeFireAndForget(sessionId, settings, state, cts.Token);

                await ReportJobResultAsync(client, state, job.Id, new JobExecutor.ExecutionResult
                {
                    Success = true,
                    ExitCode = 0,
                    Output = "VNC most pokrenut.",
                    DurationMs = 0,
                }).ConfigureAwait(false);
                return;
            }

            if (job.CommandType == "start_webrtc_bridge")
            {
#if NETDESK_WEBRTC_CAPABLE
                // Isti fire-and-forget oblik kao start_vnc_bridge iznad -
                // uspeh se prijavljuje čim je SessionLauncher POKUŠAO da
                // pokrene bridge proces, ne kad WebRTC sesija stvarno uspe
                // (sam WebRtcBridge.exe javlja "failed" na signaling kanalu
                // preko WebRtcSession.OnConnectionFailed ako kasnije ne
                // uspe - vidi Program.cs u Netdesk.Agent.WebRtcBridge).
                var sessionId = ExtractSessionId(job.Payload);
                var launched = RunWebRtcBridge(sessionId, settings, state);

                await ReportJobResultAsync(client, state, job.Id, new JobExecutor.ExecutionResult
                {
                    Success = launched,
                    ExitCode = launched ? 0 : 1,
                    Output = launched ? "WebRTC most pokrenut." : null,
                    ErrorOutput = launched ? null : "Nema aktivne interaktivne sesije za WebRTC most (SessionLauncher).",
                    DurationMs = 0,
                }).ConfigureAwait(false);
#else
                // net452 build (Win7) - WebRTC nikad nije opcija ovde (vidi
                // Netdesk.Agent.Common.csproj napomenu: nijedna podržana
                // WebRTC biblioteka ne radi na net452). Ovaj job ne bi
                // trebalo ni da stigne net452 agentu (backend targeting
                // preko agents.remote_control_tier), ali ako ipak stigne
                // (npr. zastarela targeting odluka), čisto prijavi
                // "nepodržano" - nikad unhandled exception.
                await ReportJobResultAsync(client, state, job.Id, new JobExecutor.ExecutionResult
                {
                    Success = false,
                    ExitCode = 1,
                    ErrorOutput = "WebRTC most nije podržan na ovom agent build-u.",
                    DurationMs = 0,
                }).ConfigureAwait(false);
#endif
                return;
            }

            JobExecutor.ExecutionResult result;

            if (job.CommandType == "collect_inventory" || job.CommandType == "refresh_software_list")
            {
                // Ove dve komande ne prolaze kroz JobExecutor - njima treba
                // NetdeskApiClient/AgentState pristup koji executor namerno nema
                // (drži OS-nivo komande i mrežni/state sloj razdvojenim).
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

#if NETDESK_WEBRTC_CAPABLE
        // SessionLauncher (Netdesk.Agent.Common/Webrtc/) pokreće poseban
        // WebRtcBridge.exe UNUTAR interaktivne korisničke sesije preko
        // CreateProcessAsUser - vidi opsežnu napomenu tamo o Session 0
        // izolaciji (ni DXGI capture ni SendInput ne rade iz ovog LocalSystem
        // servisa direktno). Vraća false (bez izuzetka) ako trenutno nema
        // prijavljenog korisnika (WTSQueryUserToken padne na zaključanoj/
        // odjavljenoj konzoli) - očekivano stanje na mašini bez ikoga
        // prijavljenog, ne greška koju treba logovati kao fatalnu.
        //
        // POZNAT NEDOSTATAK (ne rešeno u ovoj promeni): putanja do
        // WebRtcBridge.exe pretpostavlja da je kopiran u isti "Service\"
        // instalacioni folder kao ovaj .exe - DEPLOYMENT.md/paketovanje
        // treba ažurirati da to stvarno uključi u net472 release zip pre
        // prvog stvarnog rollout-a, ovo NIJE još urađeno.
        private static bool RunWebRtcBridge(long sessionId, AgentSettings settings, AgentState state)
        {
            var bridgeExePath = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory, "Netdesk.Agent.WebRtcBridge.exe");
            var arguments = string.Join(" ",
                settings.ServerBaseUrl, sessionId.ToString(), state.AgentId, state.ApiKey);

            var pid = SessionLauncher.LaunchInActiveSession(bridgeExePath, arguments);
            if (pid == 0)
            {
                FileLogger.Error(
                    "WebRTC sesija #" + sessionId + " - nema aktivne interaktivne sesije za pokretanje mosta", null);
                return false;
            }
            FileLogger.Info("WebRTC most #" + sessionId + " pokrenut, PID " + pid);
            return true;
        }
#endif

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
                    includeAvailableUpdates: commandType == "collect_inventory");

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
        /// force_reinstall_agent job - admin je eksplicitno izabrao TAČAN
        /// release (releaseId/version/sha256 stižu u payload-u iz
        /// AgentReleasesView.vue), pa se instalira BEZ isNewerVersion provere
        /// (može "reinstalirati" i istu verziju - popravka oštećene
        /// instalacije). Vidi UpdateManager.ForceInstallAsync.
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
