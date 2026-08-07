using System;
using System.ComponentModel;
using System.IO;
using System.ServiceProcess;
using Newtonsoft.Json;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Manager
{
    /// <summary>
    /// Pošiljalac strane mailbox protokola - piše ManagerCommand u
    /// Paths.ManagerCommandFile i budi NetdeskAgentManager preko custom
    /// service control code-a. Primalac strana (čitanje/izvršavanje) živi u
    /// Netdesk.Agent.Manager projektu (NetdeskAgentManagerService/ManagerWorker).
    /// </summary>
    public static class ManagerCommandClient
    {
        public const string ManagerServiceName = "NetdeskAgentManager";

        /// <summary>
        /// Custom service control code (mora biti u opsegu 128-255) - "probudi
        /// se i proveri mailbox fajl". Jedan kod za sve akcije - sadržaj fajla
        /// (Action polje) određuje šta se stvarno radi.
        /// </summary>
        public const int CustomCommandCode = 128;

        private const int ServiceDoesNotExistWin32Error = 1060;

        /// <summary>
        /// Piše komandu u mailbox (atomic rename) i signalizira Manager-u.
        /// Vraća false SAMO ako sam upis fajla nije uspeo, ili ako
        /// NetdeskAgentManager servis uopšte nije instaliran na ovoj mašini
        /// (jasna, akcionabilna greška) - neuspeh samog ExecuteCommand poziva
        /// (npr. Manager trenutno nije pokrenut) se loguje ali NE vraća false,
        /// jer će Manager-ov sopstveni periodični poll ionako pokupiti komandu
        /// čim (ponovo) proradi.
        /// </summary>
        public static bool TrySend(ManagerCommand command, out string failureReason)
        {
            failureReason = null;

            if (string.IsNullOrEmpty(command.CommandId))
            {
                command.CommandId = Guid.NewGuid().ToString("N");
            }
            if (string.IsNullOrEmpty(command.IssuedAtUtc))
            {
                command.IssuedAtUtc = DateTime.UtcNow.ToString("o");
            }

            var finalPath = Paths.ManagerCommandFile;
            var tmpPath = finalPath + ".tmp";

            try
            {
                var dir = Path.GetDirectoryName(finalPath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var json = JsonConvert.SerializeObject(command, Formatting.Indented);
                File.WriteAllText(tmpPath, json);

                if (File.Exists(finalPath))
                {
                    File.Delete(finalPath);
                }
                File.Move(tmpPath, finalPath);
            }
            catch (Exception ex)
            {
                failureReason = "Upis komande za Manager nije uspeo: " + ex.Message;
                FileLogger.Error(failureReason, ex);
                return false;
            }

            try
            {
                using (var sc = new ServiceController(ManagerServiceName))
                {
                    sc.ExecuteCommand(CustomCommandCode);
                }
            }
            catch (InvalidOperationException ex) when (IsServiceNotInstalled(ex))
            {
                failureReason = "NetdeskAgentManager servis nije instaliran na ovoj mašini.";
                FileLogger.Error(failureReason, ex);
                return false;
            }
            catch (Exception ex)
            {
                // Manager trenutno ne radi (stopped/starting/itd) - komanda je
                // već upisana, njegov sledeći tick poll je pokupi. Ne tretiramo
                // kao neuspeh dispatch-a.
                FileLogger.Warn(
                    "Signal ka NetdeskAgentManager-u (ExecuteCommand) nije uspeo, komanda čeka u mailbox-u: " +
                    ex.Message);
            }

            return true;
        }

        private static bool IsServiceNotInstalled(InvalidOperationException ex)
        {
            var win32 = ex.InnerException as Win32Exception;
            return win32 != null && win32.NativeErrorCode == ServiceDoesNotExistWin32Error;
        }
    }
}
