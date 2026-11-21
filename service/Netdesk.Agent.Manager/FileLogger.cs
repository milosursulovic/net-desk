using System;
using System.IO;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own copy (deliberately, not a reference to Netdesk.Agent.Common) -
    /// since this change the Manager is a completely standalone service, zero shared
    /// code with the Netdesk Agent, so it can be updated/installed
    /// independently without the risk of a shared library lagging behind (see
    /// the WinDivert64.sys lock incident that motivated this - the Manager
    /// shared Common.dll with the Service for a long time but never
    /// auto-updated itself, so the fix had to be pushed by hand via
    /// a separate preset).
    /// </summary>
    internal static class FileLogger
    {
        private static readonly object Lock = new object();
        private static string _logFilePath;

        public static void Initialize(string logFilePath)
        {
            _logFilePath = logFilePath;

            var dir = Path.GetDirectoryName(logFilePath);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
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
