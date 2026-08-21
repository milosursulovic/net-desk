using System;
using System.IO;
using System.Threading;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena kopija (ne referenca na Netdesk.Agent.Common.Update.
    /// DirectorySync) - rekurzivno kopiranje foldera za backup/instalaciju.
    /// Retry logika ispod postoji zbog uživo otkrivenog incidenta: WinDivert
    /// (kernel drajver koji Service koristi za DNS logging, vidi
    /// Netdesk.Agent.Common/DnsLogs/WinDivertInterop.cs) ume da drži
    /// WinDivert64.sys zaključan kratko VREME I POSLE što je NetdeskAgent
    /// servis (proces koji ga je otvorio) već potvrđeno zaustavljen - driver
    /// unload nije garantovano sinhron sa gašenjem user-mode procesa koji ga
    /// je koristio. Isti simptom/mitigacija važi i ako neki AV/EDR privremeno
    /// skenira/drži otvoren novo-kopiran fajl.
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
                catch (IOException) when (attempt < MaxRetries)
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
                catch (IOException) when (attempt < MaxRetries)
                {
                    Thread.Sleep(RetryDelay);
                }
            }

            // Poslednji pokušaj - propušta IOException dalje ako i dalje ne
            // uspe (InstallFilesAsync ovo hvata i pokreće rollback).
            File.Copy(sourcePath, destPath, true);
        }
    }
}
