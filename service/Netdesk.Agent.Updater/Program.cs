using System;
using System.Collections.Generic;
using System.IO;
using System.ServiceProcess;
using System.Threading;
using NetdeskAgent.Common.Http;
using NetdeskAgent.Common.Update;

namespace NetdeskAgent.Updater
{
    /// <summary>
    /// Odvojen proces koji izvodi stvarnu zamenu fajlova (spec sekcija 7,
    /// koraci 5-9). Netdesk.Agent.Service.exe pokreće ovaj proces i nastavlja
    /// da radi dok ga Updater ne zaustavi preko SCM-a - Windows tada sam
    /// poziva OnStop() na servisu, nema potrebe za koordinacijom u drugom
    /// smeru. Ako bilo koji korak (stop/backup/copy/start) ne uspe, vrši se
    /// rollback iz backup-a i ponovni pokušaj starta pre javljanja neuspeha.
    /// </summary>
    internal static class Program
    {
        private static void Main(string[] args)
        {
            string missingArg;
            var opts = ParseAndValidateArgs(args, out missingArg);

            if (missingArg != null)
            {
                Console.Error.WriteLine("Nedostaje obavezan argument: --" + missingArg);
                Environment.Exit(1);
                return;
            }

            // Kratka pauza da pozivajući proces (Netdesk.Agent.Service.exe)
            // stigne da se potpuno odvoji pre nego što mi zaustavimo taj isti
            // Windows servis.
            Thread.Sleep(2000);

            var success = false;
            string failureReason = null;

            try
            {
                StopService(opts.ServiceName, TimeSpan.FromSeconds(30));
                BackupInstallDir(opts.InstallDir, opts.BackupDir);
                CopyStagingIntoInstallDir(opts.StagingDir, opts.InstallDir);
                StartService(opts.ServiceName, TimeSpan.FromSeconds(30));
                success = true;
            }
            catch (Exception ex)
            {
                failureReason = ex.Message;

                try
                {
                    RestoreBackup(opts.BackupDir, opts.InstallDir);
                    StartService(opts.ServiceName, TimeSpan.FromSeconds(30));
                }
                catch (Exception rollbackEx)
                {
                    failureReason += " | Rollback takođe neuspešan: " + rollbackEx.Message;
                }
            }

            try
            {
                ReportResultAsync(opts, success, failureReason).GetAwaiter().GetResult();
            }
            catch
            {
                // Ako ni izveštavanje ne uspe, nema šta više da se uradi ovde -
                // sledeći heartbeat sa (nadamo se) ponovo pokrenutog servisa
                // će ionako odraziti stvarno stanje agent_version na serveru.
            }
        }

        private static void StopService(string serviceName, TimeSpan timeout)
        {
            using (var sc = new ServiceController(serviceName))
            {
                if (sc.Status != ServiceControllerStatus.Stopped)
                {
                    sc.Stop();
                    sc.WaitForStatus(ServiceControllerStatus.Stopped, timeout);
                }
            }
        }

        private static void StartService(string serviceName, TimeSpan timeout)
        {
            using (var sc = new ServiceController(serviceName))
            {
                sc.Refresh();
                if (sc.Status != ServiceControllerStatus.Running)
                {
                    sc.Start();
                    sc.WaitForStatus(ServiceControllerStatus.Running, timeout);
                }
            }
        }

        private static void BackupInstallDir(string installDir, string backupDir)
        {
            Directory.CreateDirectory(backupDir);
            foreach (var file in Directory.GetFiles(installDir))
            {
                File.Copy(file, Path.Combine(backupDir, Path.GetFileName(file)), true);
            }
        }

        private static void CopyStagingIntoInstallDir(string stagingDir, string installDir)
        {
            Directory.CreateDirectory(installDir);
            foreach (var file in Directory.GetFiles(stagingDir))
            {
                File.Copy(file, Path.Combine(installDir, Path.GetFileName(file)), true);
            }
        }

        private static void RestoreBackup(string backupDir, string installDir)
        {
            if (!Directory.Exists(backupDir)) return;

            foreach (var file in Directory.GetFiles(backupDir))
            {
                File.Copy(file, Path.Combine(installDir, Path.GetFileName(file)), true);
            }
        }

        private static async System.Threading.Tasks.Task ReportResultAsync(
            UpdateArgs opts, bool success, string reason)
        {
            using (var client = new NetdeskApiClient(opts.ServerBaseUrl))
            {
                await client.ReportUpdateAsync(opts.AgentId, opts.ApiKey, new UpdateReportRequest
                {
                    FromVersion = opts.FromVersion,
                    ToVersion = opts.ToVersion,
                    Success = success,
                    Reason = reason,
                }).ConfigureAwait(false);
            }
        }

        private class UpdateArgs
        {
            public string ServiceName;
            public string StagingDir;
            public string InstallDir;
            public string BackupDir;
            public string ServerBaseUrl;
            public string AgentId;
            public string ApiKey;
            public string FromVersion;
            public string ToVersion;
        }

        private static UpdateArgs ParseAndValidateArgs(string[] args, out string missingArg)
        {
            var opts = ParseArgs(args);

            var result = new UpdateArgs
            {
                ServiceName = GetOrNull(opts, "service-name"),
                StagingDir = GetOrNull(opts, "staging-dir"),
                InstallDir = GetOrNull(opts, "install-dir"),
                BackupDir = GetOrNull(opts, "backup-dir"),
                ServerBaseUrl = GetOrNull(opts, "server-base-url"),
                AgentId = GetOrNull(opts, "agent-id"),
                ApiKey = GetOrNull(opts, "api-key"),
                FromVersion = GetOrNull(opts, "from-version"),
                ToVersion = GetOrNull(opts, "to-version"),
            };

            missingArg = FindMissing(result);
            return result;
        }

        private static Dictionary<string, string> ParseArgs(string[] args)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var i = 0;

            while (i < args.Length)
            {
                if (args[i].StartsWith("--") && i + 1 < args.Length)
                {
                    result[args[i].Substring(2)] = args[i + 1];
                    i += 2;
                }
                else
                {
                    i++;
                }
            }

            return result;
        }

        private static string GetOrNull(Dictionary<string, string> opts, string key)
        {
            string v;
            return opts.TryGetValue(key, out v) ? v : null;
        }

        private static string FindMissing(UpdateArgs a)
        {
            if (string.IsNullOrEmpty(a.ServiceName)) return "service-name";
            if (string.IsNullOrEmpty(a.StagingDir)) return "staging-dir";
            if (string.IsNullOrEmpty(a.InstallDir)) return "install-dir";
            if (string.IsNullOrEmpty(a.BackupDir)) return "backup-dir";
            if (string.IsNullOrEmpty(a.ServerBaseUrl)) return "server-base-url";
            if (string.IsNullOrEmpty(a.AgentId)) return "agent-id";
            if (string.IsNullOrEmpty(a.ApiKey)) return "api-key";
            if (string.IsNullOrEmpty(a.FromVersion)) return "from-version";
            if (string.IsNullOrEmpty(a.ToVersion)) return "to-version";
            return null;
        }
    }
}
