using System;
using System.IO;

namespace NetdeskAgent.Common.Logging
{
    /// <summary>
    /// A simple thread-safe append-only logger to a text file. Deliberately without an
    /// external logging library (fewer dependencies for a service that must
    /// also run on Windows 7 with .NET Framework 4.5.2).
    /// Errors while writing the log are swallowed - logging must never bring down the service.
    /// </summary>
    public static class FileLogger
    {
        private static readonly object Lock = new object();
        private static string _logFilePath;

        public static void Initialize(string logFilePath)
        {
            _logFilePath = logFilePath;

            try
            {
                var dir = Path.GetDirectoryName(logFilePath);
                if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }
            }
            catch
            {
                // The same contract as Write() below - logging must never
                // bring down the caller. This branch was an oversight (discovered live:
                // a process whose user profile may not be fully loaded -
                // Directory.CreateDirectory threw HERE, before
                // a single Write() had even been called, killing the whole calling process
                // completely silently).
            }
        }

        public static void Info(string message) => Write("INFO", message);

        public static void Warn(string message) => Write("WARN", message);

        public static void Error(string message, Exception ex = null) =>
            Write("ERROR", ex == null ? message : message + ": " + ex);

        private static void Write(string level, string message)
        {
            if (string.IsNullOrEmpty(_logFilePath)) return;

            var line = string.Format(
                "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}",
                DateTime.UtcNow,
                level,
                message);

            lock (Lock)
            {
                try
                {
                    File.AppendAllText(_logFilePath, line + Environment.NewLine);
                }
                catch
                {
                    // logging must not bring down the service
                }
            }
        }
    }
}
