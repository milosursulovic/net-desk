using System;
using System.IO;
using System.Threading;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Update
{
    /// <summary>
    /// Rekurzivno kopiranje foldera - koristi ga NetdeskAgentManager za
    /// backup/instalaciju update paketa. Postoji odvojeno od (i ispravlja bug
    /// u) starom Netdesk.Agent.Updater/Program.cs, čije su BackupInstallDir/
    /// CopyStagingIntoInstallDir bile RAVNE (Directory.GetFiles bez
    /// SearchOption.AllDirectories) - nikad nisu ispravno kopirale amd64\/x86\
    /// podfoldere iz pravog instalacionog rasporeda.
    /// </summary>
    public static class DirectorySync
    {
        // Otkriveno uživo na prvom stvarnom update-u koji je uključio
        // WinDivert.dll/WinDivert64.sys (1.7.0): WinDivert se učitava kao
        // pravi kernel drajver, i STVARNO oslobađanje .sys fajla od strane
        // Windows-a ume da kasni koji trenutak posle toga što je
        // ManagerWorker.StopService već potvrdio da je NetdeskAgent servis
        // (user-mode proces koji je zvao WinDivertClose) u Stopped stanju -
        // drajver-unload nije garantovano sinhron sa gašenjem procesa koji ga
        // je otvorio. Kratak retry sa pauzom apsorbuje tu vremensku rupu (i,
        // uzgred, isti problem ako neki AV/EDR privremeno drži .sys fajl
        // otvoren radi skeniranja - isti simptom, ista mitigacija).
        //
        // Hvata i IOException (ERROR_SHARING_VIOLATION) i
        // UnauthorizedAccessException (ERROR_ACCESS_DENIED) - Windows vraća
        // JEDNU ili DRUGU za isti uzrok (drajver-fajl još učitan) zavisno od
        // trenutka, .NET ih baca kao dva nepovezana tipa
        // (UnauthorizedAccessException NE nasleđuje IOException) - hvatanje
        // samo prvog je uživo propustilo drugi ("Access to the path
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
                    // Fajl je (verovatno privremeno) zaključan - drajver-unload
                    // kašnjenje ili AV/EDR sken. Namerno se NE loguje na svaki
                    // pokušaj (spam), samo na kraju ako je stvarno trebalo da
                    // se čeka - vidi log iznad na uspehu, i grešku ispod ako
                    // ni MaxRetries pokušaja nije bilo dovoljno.
                    Thread.Sleep(RetryDelay);
                }
            }

            // Poslednji pokušaj - propušta grešku dalje ako i dalje ne uspe
            // posle svih retry-ja (isti ugovor kao pre ove izmene - pozivalac
            // hvata ovo i javlja neuspeh).
            File.Copy(sourcePath, destPath, true);
        }

        private static bool IsTransientLock(Exception ex) =>
            ex is IOException || ex is UnauthorizedAccessException;
    }
}
