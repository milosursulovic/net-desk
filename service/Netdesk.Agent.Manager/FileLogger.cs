using System;
using System.IO;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena kopija (namerno, ne referenca na Netdesk.Agent.Common) -
    /// Manager je od ove izmene potpuno samostalan servis, nula deljenog
    /// koda sa Netdesk Agent-om, da bi mogao da se update-uje/instalira
    /// nezavisno bez rizika da mu zajednička biblioteka zaostane iza (vidi
    /// WinDivert64.sys lock incident koji je ovo motivisao - Manager je
    /// dugo delio Common.dll sa Service-om ali se sam nikad nije
    /// auto-update-ovao, pa je popravka morala ručno da se gura preko
    /// posebnog preseta).
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
                    // logovanje ne sme da obori servis
                }
            }
        }
    }
}
