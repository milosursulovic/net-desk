using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Jobs
{
    /// <summary>
    /// Executes commands from the allowed list (spec 11.10 / backend
    /// dtos/agentJobs.dto.js COMMAND_TYPES). "collect_inventory" and
    /// "refresh_software_list" are NOT here - they need NetdeskApiClient/
    /// AgentState access that this executor deliberately doesn't have, so AgentWorker
    /// handles them separately (it calls InventoryCollector directly).
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
                        return Finish(sw, LogoffActiveSessions());

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
            // /t 15 gives 15 seconds for the HTTP report of this command's success to reach
            // the server before the computer actually restarts/shuts down -
            // shutdown.exe only SCHEDULES the action and returns an exit code immediately, so
            // this process call finishes almost instantly.
            return ProcessRunner.Run("shutdown.exe", arguments, DefaultTimeout);
        }

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSEnumerateSessions(
            IntPtr hServer, int Reserved, int Version, out IntPtr ppSessionInfo, out int pCount);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSFreeMemory(IntPtr pMemory);

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSLogoffSession(IntPtr hServer, int SessionId, bool bWait);

        [StructLayout(LayoutKind.Sequential)]
        private struct WTS_SESSION_INFO
        {
            public int SessionID;
            [MarshalAs(UnmanagedType.LPStr)]
            public string pWinStationName;
            public int State;
        }

        private const int WTS_CURRENT_SERVER_HANDLE = 0;
        private const int WTSActive = 0;

        /// <summary>
        /// "shutdown.exe /l" logs off the caller's CURRENT session - but a service
        /// under the LocalSystem account runs in Session 0, which has no
        /// interactive user session of its own, so the call fails immediately (ExitCode=1),
        /// regardless of the arguments. Discovered live. The correct way for a service to
        /// log off the SIGNED-IN user is via the WTS (Windows Terminal
        /// Services) API - enumerate the active sessions and explicitly log off
        /// each one in the WTSActive state (an interactively signed-in user,
        /// not disconnected/listening/etc).
        /// </summary>
        private static ProcessRunner.ProcessResult LogoffActiveSessions()
        {
            var sessionInfoPtr = IntPtr.Zero;
            int count;
            var loggedOffCount = 0;

            try
            {
                if (!WTSEnumerateSessions((IntPtr)WTS_CURRENT_SERVER_HANDLE, 0, 1, out sessionInfoPtr, out count))
                {
                    return new ProcessRunner.ProcessResult
                    {
                        ExitCode = -1,
                        ErrorOutput = "WTSEnumerateSessions neuspešan (Win32 error " + Marshal.GetLastWin32Error() + ").",
                        TimedOut = false,
                    };
                }

                var entrySize = Marshal.SizeOf(typeof(WTS_SESSION_INFO));
                var current = sessionInfoPtr;

                for (var i = 0; i < count; i++)
                {
                    var session = (WTS_SESSION_INFO)Marshal.PtrToStructure(current, typeof(WTS_SESSION_INFO));
                    current = (IntPtr)((long)current + entrySize);

                    if (session.State != WTSActive) continue;

                    if (WTSLogoffSession((IntPtr)WTS_CURRENT_SERVER_HANDLE, session.SessionID, false))
                    {
                        loggedOffCount++;
                    }
                }
            }
            finally
            {
                if (sessionInfoPtr != IntPtr.Zero) WTSFreeMemory(sessionInfoPtr);
            }

            return new ProcessRunner.ProcessResult
            {
                ExitCode = loggedOffCount > 0 ? 0 : 1,
                Output = loggedOffCount > 0 ? "Odjavljeno aktivnih sesija: " + loggedOffCount : null,
                ErrorOutput = loggedOffCount > 0 ? null : "Nema aktivne interaktivne korisničke sesije za odjavu.",
                TimedOut = false,
            };
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
        /// The script is written to a temporary .ps1 file and run via -File (not
        /// -Command) to avoid problems with escaping multi-line
        /// scripts. ExecutionPolicy Bypass applies only to this process call, it doesn't
        /// change the machine policy permanently.
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
                try { File.Delete(scriptPath); } catch { /* best-effort cleanup */ }
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
                        // File in use or no permission - skip, don't abort the rest of the cleanup.
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
