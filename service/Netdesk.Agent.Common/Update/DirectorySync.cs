using System;
using System.IO;
using System.Threading;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Update
{
    /// <summary>
    /// Recursive folder copy - used by NetdeskAgentManager for
    /// backup/installation of the update package. It exists separately from (and fixes a bug
    /// in) the old Netdesk.Agent.Updater/Program.cs, whose BackupInstallDir/
    /// CopyStagingIntoInstallDir were FLAT (Directory.GetFiles without
    /// SearchOption.AllDirectories) - they never correctly copied the amd64\/x86\
    /// subfolders of the real install layout.
    /// </summary>
    public static class DirectorySync
    {
        // Discovered live on the first real update that included
        // WinDivert.dll/WinDivert64.sys (1.7.0): WinDivert is loaded as a
        // real kernel driver, and Windows ACTUALLY releasing the .sys file
        // can lag a moment behind the point where
        // ManagerWorker.StopService has already confirmed that the NetdeskAgent service
        // (the user-mode process that called WinDivertClose) is in the Stopped state -
        // driver unload isn't guaranteed to be synchronous with the shutdown of the process that
        // opened it. A short retry with a pause absorbs that timing gap (and,
        // incidentally, the same problem if some AV/EDR temporarily holds the .sys file
        // open for scanning - the same symptom, the same mitigation).
        //
        // Catches both IOException (ERROR_SHARING_VIOLATION) and
        // UnauthorizedAccessException (ERROR_ACCESS_DENIED) - Windows returns
        // ONE or THE OTHER for the same cause (the driver file still loaded) depending on
        // timing, .NET throws them as two unrelated types
        // (UnauthorizedAccessException does NOT inherit from IOException) - catching
        // only the first one missed the second live ("Access to the path
        // 'WinDivert64.sys' is denied.").
        private const int MaxRetries = 8;
        private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(750);

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
                    // The file is (probably temporarily) locked - driver unload
                    // delay or an AV/EDR scan. Deliberately NOT logged on every
                    // attempt (spam), only at the end if waiting was actually
                    // needed - see the log above on success, and the error below if
                    // even MaxRetries attempts weren't enough.
                    Thread.Sleep(RetryDelay);
                }
            }

            // Last attempt - lets the error propagate if it still fails
            // after all retries (the same contract as before this change - the caller
            // catches this and reports the failure).
            File.Copy(sourcePath, destPath, true);
        }

        private static bool IsTransientLock(Exception ex) =>
            ex is IOException || ex is UnauthorizedAccessException;
    }
}
