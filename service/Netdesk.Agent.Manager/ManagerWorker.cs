using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

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

        public AutoResetEvent WakeEvent { get; } = new AutoResetEvent(false);

        public async Task RunAsync(CancellationToken token)
        {
            FileLogger.Info("Netdesk Agent Manager se pokreće...");

            // Proveri mailbox JEDNOM pre ulaska u petlju - hvata slučaj
            // "komanda stigla dok je Manager bio ugašen".
            await ProcessMailboxIfPresentAsync().ConfigureAwait(false);

            while (!token.IsCancellationRequested)
            {
                try
                {
                    WaitHandle.WaitAny(new[] { token.WaitHandle, WakeEvent }, LoopTick);

                    if (token.IsCancellationRequested) break;

                    await ProcessMailboxIfPresentAsync().ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    // Petlja mora da preživi bilo koju grešku iz jednog ciklusa -
                    // sledeći tick pokušava ponovo.
                    FileLogger.Error("Neočekivana greška u Manager radnoj petlji", ex);
                }
            }

            FileLogger.Info("Netdesk Agent Manager zaustavljen.");
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
        private static async Task InstallFilesAsync(ManagerCommand command)
        {
            var serviceName = string.IsNullOrEmpty(command.ServiceName) ? "NetdeskAgent" : command.ServiceName;

            string stopError;
            if (!TryControlService(serviceName, "stop", out stopError))
            {
                var stopFailureReason =
                    "Zaustavljanje servisa '" + serviceName + "' neuspešno - fajlovi NISU menjani: " + stopError;
                FileLogger.Error(stopFailureReason, null);
                await ReportResultIfConfiguredAsync(command, false, stopFailureReason).ConfigureAwait(false);
                return;
            }

            var success = false;
            string failureReason = null;

            try
            {
                KillProcesses(command.KillProcessNames);
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
