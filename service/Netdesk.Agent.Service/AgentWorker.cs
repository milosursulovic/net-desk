using System;
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
using NetdeskAgent.Common.Update;

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
            {
                var lastHeartbeat = DateTime.MinValue;
                var lastInventorySync = DateTime.MinValue;
                var lastJobsPoll = DateTime.MinValue;
                var lastEventLogSync = DateTime.MinValue;
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
                            await DoJobsPollAsync(client, state).ConfigureAwait(false);
                            lastJobsPoll = DateTime.UtcNow;
                        }
                        else if ((DateTime.UtcNow - lastEventLogSync).TotalSeconds >= settings.EventLogIntervalSeconds)
                        {
                            await DoEventLogSyncAsync(client, state, eventLogBookmarks).ConfigureAwait(false);
                            lastEventLogSync = DateTime.UtcNow;
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

        private static async Task DoJobsPollAsync(NetdeskApiClient client, AgentState state)
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
                await ProcessJobAsync(client, state, job).ConfigureAwait(false);
            }
        }

        private static async Task ProcessJobAsync(NetdeskApiClient client, AgentState state, JobItem job)
        {
            FileLogger.Info("Izvršavam komandu #" + job.Id + " (" + job.CommandType + ")...");

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

                await client.SubmitJobResultAsync(state.AgentId, state.ApiKey, job.Id, reportRequest).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Slanje rezultata za komandu #" + job.Id + " neuspešno", ex);
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
    }
}
