using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Jobs
{
    /// <summary>
    /// Izvršava komande iz dozvoljene liste (spec 11.10 / backend
    /// dtos/agentJobs.dto.js COMMAND_TYPES). "collect_inventory" i
    /// "refresh_software_list" NISU ovde - njima treba NetdeskApiClient/
    /// AgentState pristup koji ovaj executor namerno nema, pa ih AgentWorker
    /// obrađuje posebno (poziva InventoryCollector direktno).
    /// </summary>
    public static class JobExecutor
    {
        public class ExecutionResult
        {
            public bool Success { get; set; }
            public int? ExitCode { get; set; }
            public string Output { get; set; }
            public string ErrorOutput { get; set; }
            public long DurationMs { get; set; }
        }

        private static readonly TimeSpan DefaultTimeout = TimeSpan.FromMinutes(2);
        private static readonly TimeSpan ScriptTimeout = TimeSpan.FromMinutes(10);
        private static readonly TimeSpan ServiceControlTimeout = TimeSpan.FromSeconds(30);

        public static ExecutionResult Execute(string commandType, JObject payload)
        {
            var sw = Stopwatch.StartNew();

            try
            {
                switch (commandType)
                {
                    case "restart_computer":
                        return Finish(sw, RunShutdownExe("/r /t 15 /c \"Netdesk Agent - zakazan restart\" /f"));

                    case "shutdown_computer":
                        return Finish(sw, RunShutdownExe("/s /t 15 /c \"Netdesk Agent - zakazano gašenje\" /f"));

                    case "logoff_user":
                        return Finish(sw, RunShutdownExe("/l"));

                    case "restart_service":
                        return Finish(sw, ControlService(RequireServiceName(payload), ServiceAction.Restart));

                    case "start_service":
                        return Finish(sw, ControlService(RequireServiceName(payload), ServiceAction.Start));

                    case "stop_service":
                        return Finish(sw, ControlService(RequireServiceName(payload), ServiceAction.Stop));

                    case "run_powershell_script":
                        return Finish(sw, RunPowerShellScript(RequireScript(payload)));

                    case "delete_temp_files":
                        return Finish(sw, DeleteTempFiles());

                    default:
                        sw.Stop();
                        return new ExecutionResult
                        {
                            Success = false,
                            ExitCode = -1,
                            ErrorOutput = "Nepoznat/nepodržan tip komande: " + commandType,
                            DurationMs = sw.ElapsedMilliseconds,
                        };
                }
            }
            catch (Exception ex)
            {
                sw.Stop();
                FileLogger.Error("Izvršavanje komande neuspešno (" + commandType + ")", ex);
                return new ExecutionResult
                {
                    Success = false,
                    ExitCode = -1,
                    ErrorOutput = ex.Message,
                    DurationMs = sw.ElapsedMilliseconds,
                };
            }
        }

        private static ExecutionResult Finish(Stopwatch sw, ProcessRunner.ProcessResult r)
        {
            sw.Stop();
            return new ExecutionResult
            {
                Success = !r.TimedOut && r.ExitCode == 0,
                ExitCode = r.ExitCode,
                Output = r.Output,
                ErrorOutput = r.TimedOut ? "Komanda je istekla (timeout)." + Environment.NewLine + r.ErrorOutput : r.ErrorOutput,
                DurationMs = sw.ElapsedMilliseconds,
            };
        }

        private static ProcessRunner.ProcessResult RunShutdownExe(string arguments)
        {
            // /t 15 daje 15 sekundi da HTTP izveštaj o uspehu ove komande stigne
            // do servera pre nego što se računar stvarno restartuje/ugasi -
            // shutdown.exe samo ZAKAZUJE akciju i odmah vraća exit kod, pa se
            // ovaj proces poziv završava skoro trenutno.
            return ProcessRunner.Run("shutdown.exe", arguments, DefaultTimeout);
        }

        private enum ServiceAction
        {
            Start,
            Stop,
            Restart,
        }

        private static ProcessRunner.ProcessResult ControlService(string serviceName, ServiceAction action)
        {
            try
            {
                using (var sc = new ServiceController(serviceName))
                {
                    if (action == ServiceAction.Stop || action == ServiceAction.Restart)
                    {
                        if (sc.Status != ServiceControllerStatus.Stopped)
                        {
                            sc.Stop();
                            sc.WaitForStatus(ServiceControllerStatus.Stopped, ServiceControlTimeout);
                        }
                    }

                    if (action == ServiceAction.Start || action == ServiceAction.Restart)
                    {
                        sc.Refresh();
                        if (sc.Status != ServiceControllerStatus.Running)
                        {
                            sc.Start();
                            sc.WaitForStatus(ServiceControllerStatus.Running, ServiceControlTimeout);
                        }
                    }

                    sc.Refresh();
                    return new ProcessRunner.ProcessResult
                    {
                        ExitCode = 0,
                        Output = "Servis '" + serviceName + "' status: " + sc.Status,
                        ErrorOutput = null,
                        TimedOut = false,
                    };
                }
            }
            catch (Exception ex)
            {
                return new ProcessRunner.ProcessResult
                {
                    ExitCode = 1,
                    Output = null,
                    ErrorOutput = "Upravljanje servisom '" + serviceName + "' neuspešno: " + ex.Message,
                    TimedOut = false,
                };
            }
        }

        /// <summary>
        /// Skripta se piše u privremeni .ps1 fajl i pokreće preko -File (ne
        /// -Command) da se izbegnu problemi sa escape-ovanjem višelinijskih
        /// skripti. ExecutionPolicy Bypass važi samo za ovaj proces poziv, ne
        /// menja mašinsku politiku trajno.
        /// </summary>
        private static ProcessRunner.ProcessResult RunPowerShellScript(string script)
        {
            var scriptPath = Path.Combine(Path.GetTempPath(), "netdesk-job-" + Guid.NewGuid().ToString("N") + ".ps1");

            try
            {
                File.WriteAllText(scriptPath, script);

                var arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + scriptPath + "\"";
                return ProcessRunner.Run("powershell.exe", arguments, ScriptTimeout);
            }
            finally
            {
                try { File.Delete(scriptPath); } catch { /* best effort čišćenje */ }
            }
        }

        private static ProcessRunner.ProcessResult DeleteTempFiles()
        {
            int deleted = 0, skipped = 0;

            foreach (var dir in new[] { Path.GetTempPath(), Environment.ExpandEnvironmentVariables(@"%WINDIR%\Temp") })
            {
                if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) continue;

                foreach (var file in SafeEnumerateFiles(dir))
                {
                    try
                    {
                        File.Delete(file);
                        deleted++;
                    }
                    catch
                    {
                        // Fajl u upotrebi ili bez dozvole - preskoči, ne prekidaj ostatak čišćenja.
                        skipped++;
                    }
                }
            }

            return new ProcessRunner.ProcessResult
            {
                ExitCode = 0,
                Output = "Obrisano " + deleted + " fajlova, preskočeno " + skipped + " (u upotrebi/zaključano).",
                ErrorOutput = null,
                TimedOut = false,
            };
        }

        private static System.Collections.Generic.IEnumerable<string> SafeEnumerateFiles(string dir)
        {
            try
            {
                return Directory.GetFiles(dir);
            }
            catch
            {
                return new string[0];
            }
        }

        private static string RequireServiceName(JObject payload)
        {
            var name = payload != null ? (string)payload["serviceName"] : null;
            if (string.IsNullOrWhiteSpace(name))
            {
                throw new InvalidOperationException("payload.serviceName nedostaje.");
            }
            return name;
        }

        private static string RequireScript(JObject payload)
        {
            var script = payload != null ? (string)payload["script"] : null;
            if (string.IsNullOrWhiteSpace(script))
            {
                throw new InvalidOperationException("payload.script nedostaje.");
            }
            return script;
        }
    }
}
