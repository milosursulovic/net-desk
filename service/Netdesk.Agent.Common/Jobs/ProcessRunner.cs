using System;
using System.Diagnostics;
using System.Text;

namespace NetdeskAgent.Common.Jobs
{
    internal static class ProcessRunner
    {
        public class ProcessResult
        {
            public int ExitCode { get; set; }
            public string Output { get; set; }
            public string ErrorOutput { get; set; }
            public bool TimedOut { get; set; }
        }

        /// <summary>
        /// Starts a process without a window, captures stdout/stderr, waits up to the timeout.
        /// If the process doesn't finish in time, it's killed (best effort) and
        /// TimedOut=true is returned - the command is still reported to the server as a result,
        /// just with a clear indication that it timed out, instead of the agent hanging forever
        /// on one stuck command.
        /// </summary>
        public static ProcessResult Run(string fileName, string arguments, TimeSpan timeout)
        {
            var stdout = new StringBuilder();
            var stderr = new StringBuilder();

            var psi = new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            using (var process = new Process { StartInfo = psi, EnableRaisingEvents = true })
            {
                process.OutputDataReceived += (s, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
                process.ErrorDataReceived += (s, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();

                var finished = process.WaitForExit((int)timeout.TotalMilliseconds);

                if (!finished)
                {
                    try { process.Kill(); } catch { /* the process may have already finished in the meantime */ }

                    return new ProcessResult
                    {
                        ExitCode = -1,
                        Output = stdout.ToString(),
                        ErrorOutput = stderr.ToString(),
                        TimedOut = true,
                    };
                }

                // WaitForExit(int) doesn't guarantee that all async output events
                // have arrived - the extra parameterless WaitForExit() ensures that.
                process.WaitForExit();

                return new ProcessResult
                {
                    ExitCode = process.ExitCode,
                    Output = stdout.ToString(),
                    ErrorOutput = stderr.ToString(),
                    TimedOut = false,
                };
            }
        }
    }
}
