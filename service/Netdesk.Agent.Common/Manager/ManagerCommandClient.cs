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
    /// The sender side of the mailbox protocol - writes a ManagerCommand to
    /// Paths.ManagerCommandFile and wakes NetdeskAgentManager via a custom
    /// service control code. The receiver side (reading/executing) lives in the
    /// Netdesk.Agent.Manager project (NetdeskAgentManagerService/ManagerWorker).
    /// </summary>
    public static class ManagerCommandClient
    {
        public const string ManagerServiceName = "NetdeskAgentManager";

        /// <summary>
        /// Custom service control code (must be in the 128-255 range) - "wake
        /// up and check the mailbox file". One code for all actions - the file contents
        /// (the Action field) determine what actually gets done.
        /// </summary>
        public const int CustomCommandCode = 128;

        private const int ServiceDoesNotExistWin32Error = 1060;

        /// <summary>
        /// Writes the command to the mailbox (atomic rename) and signals the Manager.
        /// Returns false ONLY if writing the file itself failed, or if the
        /// NetdeskAgentManager service isn't installed on this machine at all
        /// (a clear, actionable error) - a failure of the ExecuteCommand call itself
        /// (e.g. the Manager isn't currently running) is logged but does NOT return false,
        /// because the Manager's own periodic poll will pick up the command anyway
        /// as soon as it's running (again).
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
                // The Manager isn't currently running (stopped/starting/etc) - the command is
                // already written, its next tick poll will pick it up. We don't treat this
                // as a dispatch failure.
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
