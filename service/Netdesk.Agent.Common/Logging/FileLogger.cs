using System;
using System.IO;

namespace NetdeskAgent.Common.Logging
{
    /// <summary>
    /// Prost thread-safe append-only logger u tekstualni fajl. Namerno bez
    /// eksterne logging biblioteke (manje zavisnosti za servis koji mora da
    /// radi i na Windows 7 sa .NET Framework 4.5.2).
    /// Greške pri pisanju loga se gutaju - logovanje nikad ne sme da obori servis.
    /// </summary>
    public static class FileLogger
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
                    // logovanje ne sme da obori servis
                }
            }
        }
    }
}
