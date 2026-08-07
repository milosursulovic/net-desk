using System.IO;

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
        public static void CopyDirectoryRecursive(string sourceDir, string destDir)
        {
            Directory.CreateDirectory(destDir);

            foreach (var filePath in Directory.GetFiles(sourceDir))
            {
                var destPath = Path.Combine(destDir, Path.GetFileName(filePath));
                File.Copy(filePath, destPath, true);
            }

            foreach (var subDir in Directory.GetDirectories(sourceDir))
            {
                var destSubDir = Path.Combine(destDir, Path.GetFileName(subDir));
                CopyDirectoryRecursive(subDir, destSubDir);
            }
        }
    }
}
