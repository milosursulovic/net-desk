using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Threading.Tasks;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Http;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Update
{
    /// <summary>
    /// Orkestrira proveru/preuzimanje/SHA-256 verifikaciju nove verzije i
    /// pokretanje Netdesk.Agent.Updater.exe (spec sekcija 7). Sama zamena
    /// fajlova i restart servisa NIJE ovde - to radi Updater kao odvojen
    /// proces, jer servis ne sme (i ne može, dok je fajl u upotrebi) da menja
    /// sopstveni izvršni fajl dok je pokrenut.
    ///
    /// Napomena o bezbednosti: SHA-256 integritet se proverava. Digitalni
    /// potpis paketa (spec pominje kao "mogućnost") NIJE implementiran - to bi
    /// zahtevalo code-signing sertifikat/PKI koji van ovog projekta ne postoji.
    /// </summary>
    public static class UpdateManager
    {
        public static async Task CheckAndStartUpdateAsync(NetdeskApiClient client, AgentState state, string currentVersion)
        {
            UpdateCheckResponse check;
            try
            {
                check = await client.CheckUpdateAsync(state.AgentId, state.ApiKey).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Provera nove verzije neuspešna", ex);
                return;
            }

            if (check == null || !check.UpdateAvailable)
            {
                return;
            }

            FileLogger.Info("Dostupna nova verzija agenta: " + check.Version + " (trenutna: " + currentVersion + ")");

            var updateRoot = Path.Combine(Paths.DataDir, "update-staging");
            Directory.CreateDirectory(updateRoot);

            var packagePath = Path.Combine(updateRoot, check.Version + ".zip");
            var stagingDir = Path.Combine(updateRoot, check.Version);

            try
            {
                await client.DownloadUpdateFileAsync(state.AgentId, state.ApiKey, check.DownloadUrl, packagePath)
                    .ConfigureAwait(false);

                if (!VerifySha256(packagePath, check.Sha256))
                {
                    FileLogger.Error(
                        "SHA-256 provera paketa neuspešna (mogući problem integriteta) - update se odbacuje.", null);
                    return;
                }

                if (Directory.Exists(stagingDir))
                {
                    Directory.Delete(stagingDir, true);
                }

                ZipFile.ExtractToDirectory(packagePath, stagingDir);

                var installDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
                var updaterExePath = ResolveUpdaterExePath(installDir);

                if (string.IsNullOrEmpty(updaterExePath) || !File.Exists(updaterExePath))
                {
                    FileLogger.Error("Netdesk.Agent.Updater.exe nije pronađen na: " + updaterExePath, null);
                    return;
                }

                var backupDir = Path.Combine(
                    Paths.DataDir, "update-backup", currentVersion + "-" + DateTime.UtcNow.Ticks);

                LaunchUpdater(updaterExePath, stagingDir, installDir, backupDir, client.BaseUrl, state, currentVersion, check.Version);

                FileLogger.Info("Netdesk.Agent.Updater.exe pokrenut - servis će uskoro biti zaustavljen radi ažuriranja.");
            }
            catch (NetdeskApiException apiEx)
            {
                FileLogger.Error("Preuzimanje update paketa odbijeno od servera (HTTP " + apiEx.StatusCode + ")", apiEx);
            }
            catch (Exception ex)
            {
                FileLogger.Error("Priprema ažuriranja neuspešna", ex);
            }
            finally
            {
                TryDelete(packagePath);
            }
        }

        private static void LaunchUpdater(
            string updaterExePath,
            string stagingDir,
            string installDir,
            string backupDir,
            string serverBaseUrl,
            AgentState state,
            string fromVersion,
            string toVersion)
        {
            var arguments = string.Format(
                "--service-name \"NetdeskAgent\" --staging-dir \"{0}\" --install-dir \"{1}\" --backup-dir \"{2}\" " +
                "--server-base-url \"{3}\" --agent-id \"{4}\" --api-key \"{5}\" --from-version \"{6}\" --to-version \"{7}\"",
                stagingDir, installDir, backupDir, serverBaseUrl, state.AgentId, state.ApiKey, fromVersion, toVersion);

            var psi = new ProcessStartInfo
            {
                FileName = updaterExePath,
                Arguments = arguments,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden,
            };

            Process.Start(psi);

            // Servis se ne gasi sam ovde - Updater.exe zaustavlja "NetdeskAgent"
            // servis preko SCM-a, što prirodno pokreće OnStop() na ovom procesu.
            // Nema potrebe za posebnom logikom izlaska.
        }

        /// <summary>
        /// Konvencija rasporeda instalacije: ...\NetdeskAgent\Service\Netdesk.Agent.Service.exe
        /// i ...\NetdeskAgent\Updater\Netdesk.Agent.Updater.exe kao rodbraća.
        /// Updater namerno živi van foldera koji update paket prepisuje, da
        /// nikad ne prepisuje sopstvene fajlove dok je pokrenut.
        /// </summary>
        private static string ResolveUpdaterExePath(string serviceInstallDir)
        {
            if (string.IsNullOrEmpty(serviceInstallDir)) return null;

            var parent = Directory.GetParent(serviceInstallDir);
            return parent == null ? null : Path.Combine(parent.FullName, "Updater", "Netdesk.Agent.Updater.exe");
        }

        private static bool VerifySha256(string filePath, string expectedHex)
        {
            if (string.IsNullOrEmpty(expectedHex)) return false;

            using (var sha256 = SHA256.Create())
            using (var stream = File.OpenRead(filePath))
            {
                var hashBytes = sha256.ComputeHash(stream);
                var hex = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                return string.Equals(hex, expectedHex.ToLowerInvariant(), StringComparison.Ordinal);
            }
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
                // best effort čišćenje privremenog .zip fajla
            }
        }
    }
}
