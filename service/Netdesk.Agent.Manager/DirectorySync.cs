using System;
using System.IO;
using System.Threading;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own copy (not a reference to Netdesk.Agent.Common.Update.
    /// DirectorySync) - recursive folder copying for installation.
    /// The retry logic below exists because of a live-discovered incident: WinDivert
    /// (the kernel driver the Service uses for DNS logging, see
    /// Netdesk.Agent.Common/DnsLogs/WinDivertInterop.cs) can keep
    /// WinDivert64.sys locked for a short TIME even AFTER the NetdeskAgent
    /// service (the process that opened it) has been confirmed stopped - driver
    /// unload isn't guaranteed to be synchronous with the shutdown of the user-mode process that
    /// used it. The same symptom/mitigation applies if some AV/EDR temporarily
    /// scans/holds open a newly copied file. Catches both IOException
    /// (ERROR_SHARING_VIOLATION) and UnauthorizedAccessException
    /// (ERROR_ACCESS_DENIED) - Windows returns ONE or THE OTHER for the same cause
    /// (the driver file still loaded) depending on timing, .NET throws them as two
    /// unrelated types (UnauthorizedAccessException does NOT inherit from
    /// IOException) - catching only the first one missed the second live.
    /// </summary>
    internal static class DirectorySync
    {
        private const int MaxRetries = 8;
        private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(750);

        /// <summary>
        /// The same retry reason as CopyFileWithRetry below - deleting a folder
        /// runs into the identical transient lock (e.g. WinDivert64.sys) as
        /// copying. Directory.Delete(path, true) can be called again without
        /// consequences even after a partial success - already deleted items simply
        /// no longer exist, the retry just continues with what's left.
        /// </summary>
        public static void DeleteDirectoryWithRetry(string path)
        {
            if (!Directory.Exists(path)) return;

            for (var attempt = 1; attempt <= MaxRetries; attempt++)
            {
                try
                {
                    Directory.Delete(path, true);
                    if (attempt > 1)
                    {
                        FileLogger.Info("Brisanje '" + path + "' uspelo posle " + attempt + " pokušaja.");
                    }
                    return;
                }
                catch (Exception ex) when (IsTransientLock(ex) && attempt < MaxRetries)
                {
                    Thread.Sleep(RetryDelay);
                }
            }

            Directory.Delete(path, true);
        }

        public static void CopyDirectoryRecursive(string sourceDir, string destDir)
        {
            Directory.CreateDirectory(destDir);

            foreach (var filePath in Directory.GetFiles(sourceDir))
            {
                var destPath = Path.Combine(destDir, Path.GetFileName(filePath));
                CopyFileWithRetry(filePath, destPath);
            }

            foreach (var subDir in Directory.GetDirectories(sourceDir))
            {
                var destSubDir = Path.Combine(destDir, Path.GetFileName(subDir));
                CopyDirectoryRecursive(subDir, destSubDir);
            }
        }

        private static void CopyFileWithRetry(string sourcePath, string destPath)
        {
            for (var attempt = 1; attempt <= MaxRetries; attempt++)
            {
                try
                {
                    File.Copy(sourcePath, destPath, true);
                    if (attempt > 1)
                    {
                        FileLogger.Info(
                            "Kopiranje '" + Path.GetFileName(sourcePath) + "' uspelo posle " + attempt + " pokušaja.");
                    }
                    return;
                }
                catch (Exception ex) when (IsTransientLock(ex) && attempt < MaxRetries)
                {
                    Thread.Sleep(RetryDelay);
                }
            }

            // Last attempt - lets the error propagate if it still fails
            // (InstallFilesAsync catches this and reports the failure via
            // ReportResultIfConfiguredAsync - there's no rollback anymore).
            File.Copy(sourcePath, destPath, true);
        }

        private static bool IsTransientLock(Exception ex) =>
            ex is IOException || ex is UnauthorizedAccessException;
    }
}
