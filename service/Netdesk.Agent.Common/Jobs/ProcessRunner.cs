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
        /// Pokreće proces bez prozora, hvata stdout/stderr, čeka do timeout-a.
        /// Ako proces ne završi na vreme, ubija se (best effort) i vraća
        /// TimedOut=true - komanda se i dalje javlja serveru kao rezultat,
        /// samo sa jasnom naznakom da je istekla, umesto da agent visi zauvek
        /// na jednoj zaglavljenoj komandi.
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
                    try { process.Kill(); } catch { /* proces je možda već završio u međuvremenu */ }

                    return new ProcessResult
                    {
                        ExitCode = -1,
                        Output = stdout.ToString(),
                        ErrorOutput = stderr.ToString(),
                        TimedOut = true,
                    };
                }

                // WaitForExit(int) ne garantuje da su svi async output eventi
                // stigli - dodatni bezparametarski WaitForExit() to obezbeđuje.
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
