using System;
using System.IO;
using System.Threading;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena kopija (ne referenca na Netdesk.Agent.Common.Update.
    /// DirectorySync) - rekurzivno kopiranje foldera za instalaciju.
    /// Retry logika ispod postoji zbog uživo otkrivenog incidenta: WinDivert
    /// (kernel drajver koji Service koristi za DNS logging, vidi
    /// Netdesk.Agent.Common/DnsLogs/WinDivertInterop.cs) ume da drži
    /// WinDivert64.sys zaključan kratko VREME I POSLE što je NetdeskAgent
    /// servis (proces koji ga je otvorio) već potvrđeno zaustavljen - driver
    /// unload nije garantovano sinhron sa gašenjem user-mode procesa koji ga
    /// je koristio. Isti simptom/mitigacija važi i ako neki AV/EDR privremeno
    /// skenira/drži otvoren novo-kopiran fajl. Hvata i IOException
    /// (ERROR_SHARING_VIOLATION) i UnauthorizedAccessException
    /// (ERROR_ACCESS_DENIED) - Windows vraća JEDNU ili DRUGU za isti uzrok
    /// (drajver-fajl još učitan) zavisno od trenutka, .NET ih baca kao dva
    /// nepovezana tipa (UnauthorizedAccessException NE nasleđuje
    /// IOException) - hvatanje samo prvog je uživo propustilo drugi.
    /// </summary>
    internal static class DirectorySync
    {
        private const int MaxRetries = 8;
        private static readonly TimeSpan RetryDelay = TimeSpan.FromMilliseconds(750);

        /// <summary>
        /// Isti retry razlog kao CopyFileWithRetry ispod - brisanje foldera
        /// nailazi na identičan prolazan lock (npr. WinDivert64.sys) kao
        /// kopiranje. Directory.Delete(path, true) se sme pozvati ponovo bez
        /// posledica i posle delimičnog uspeha - već obrisane stavke prosto
        /// više ne postoje, retry samo nastavlja na ono što je ostalo.
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

            // Poslednji pokušaj - propušta grešku dalje ako i dalje ne uspe
            // (InstallFilesAsync ovo hvata i javlja neuspeh preko
            // ReportResultIfConfiguredAsync - nema više rollback-a).
            File.Copy(sourcePath, destPath, true);
        }

        private static bool IsTransientLock(Exception ex) =>
            ex is IOException || ex is UnauthorizedAccessException;
    }
}
