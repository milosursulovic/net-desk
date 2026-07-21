using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Http;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Update
{
    /// <summary>
    /// Orkestrira proveru/preuzimanje/SHA-256 verifikaciju/digitalni potpis
    /// nove verzije i pokretanje Netdesk.Agent.Updater.exe (spec sekcija 7).
    /// Sama zamena fajlova i restart servisa NIJE ovde - to radi Updater kao
    /// odvojen proces, jer servis ne sme (i ne može, dok je fajl u upotrebi)
    /// da menja sopstveni izvršni fajl dok je pokrenut.
    ///
    /// Bezbednost: SHA-256 integritet se uvek proverava. Digitalni potpis
    /// (spec: "mogućnost") se proverava AKO ga server pošalje - organizacija
    /// već ima internu CA distribuiranu u trusted root store svih upravljanih
    /// računara (koristi se već za HTTPS ka Netdesk serveru), pa se lanac
    /// potpisnog sertifikata proverava preko X509Chain protiv te iste trusted
    /// root - nema potrebe za posebnom distribucijom javnog ključa agentu.
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

                if (!VerifySignatureIfPresent(packagePath, check))
                {
                    // VerifySignatureIfPresent je već ulogovao tačan razlog.
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

        /// <summary>
        /// Vraća true ako je potpis validan ILI ako server nije poslao potpis
        /// za ovaj release (spec ovo tretira kao "mogućnost", ne obavezu -
        /// nastavljamo samo sa već potvrđenim SHA-256 integritetom). Vraća
        /// false SAMO kad je potpis poslat, a verifikacija (lanac ili sam
        /// potpis) ne uspe - tada se update pouzdano odbacuje.
        /// </summary>
        private static bool VerifySignatureIfPresent(string filePath, UpdateCheckResponse check)
        {
            if (string.IsNullOrEmpty(check.Signature) || string.IsNullOrEmpty(check.SignatureCertificatePem))
            {
                FileLogger.Warn(
                    "Release nema digitalni potpis (server nema podešeno potpisivanje) - preskačem proveru potpisa.");
                return true;
            }

            // Napomena o .NET Framework 4.5.2 kompatibilnosti: X509Certificate2 i
            // X509Chain NE implementiraju IDisposable pre .NET 4.6 - "using" na
            // njima je kompajl greška na pravom net452 (otkriveno tek preko
            // stvarnog MSBuild-a sa pravim reference assembly-jima; runtime GAC
            // DLL-ovi korišćeni za raniju csc.exe proveru su bili blaži). Zato
            // se ovde koristi try/finally + .Reset() umesto "using".
            X509Certificate2 cert = null;
            try
            {
                var certBytes = PemToDer(check.SignatureCertificatePem);
                cert = new X509Certificate2(certBytes);

                if (!VerifyChainToTrustedRoot(cert))
                {
                    return false;
                }

                // Ne koristimo X509Certificate2.GetRSAPublicKey() ni
                // RSA.VerifyData(byte[], byte[], HashAlgorithmName,
                // RSASignaturePadding) - obe su dodate tek u .NET 4.6.
                // Koristimo stariji RSACryptoServiceProvider API koji
                // postoji od .NET 1.0.
                var rsa = cert.PublicKey.Key as RSACryptoServiceProvider;
                if (rsa == null)
                {
                    FileLogger.Error("Sertifikat za potpis paketa nema podržan RSA javni ključ.", null);
                    return false;
                }

                var fileBytes = File.ReadAllBytes(filePath);
                var signatureBytes = Convert.FromBase64String(check.Signature);

                if (!rsa.VerifyData(fileBytes, "SHA256", signatureBytes))
                {
                    FileLogger.Error(
                        "Digitalni potpis paketa se ne poklapa sa sadržajem - update se odbacuje.", null);
                    return false;
                }

                FileLogger.Info("Digitalni potpis paketa uspešno verifikovan.");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("Verifikacija digitalnog potpisa paketa neuspešna - update se odbacuje.", ex);
                return false;
            }
            finally
            {
                if (cert != null) cert.Reset();
            }
        }

        private static bool VerifyChainToTrustedRoot(X509Certificate2 cert)
        {
            var chain = new X509Chain();
            try
            {
                // NoCheck jer organizacija najverovatnije nema CRL/OCSP
                // infrastrukturu za internu CA - sama provera lanca do
                // trusted root ostaje i dalje smislena zaštita.
                chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                chain.ChainPolicy.VerificationFlags = X509VerificationFlags.NoFlag;

                if (chain.Build(cert))
                {
                    return true;
                }

                var reasons = new List<string>();
                foreach (var status in chain.ChainStatus)
                {
                    reasons.Add(status.Status + ": " + status.StatusInformation);
                }

                FileLogger.Error(
                    "Sertifikat za potpis paketa ne vodi do trusted root CA: " + string.Join("; ", reasons), null);
                return false;
            }
            finally
            {
                chain.Reset();
            }
        }

        private static byte[] PemToDer(string pem)
        {
            const string header = "-----BEGIN CERTIFICATE-----";
            const string footer = "-----END CERTIFICATE-----";

            var start = pem.IndexOf(header, StringComparison.Ordinal);
            var end = pem.IndexOf(footer, StringComparison.Ordinal);
            if (start < 0 || end < 0)
            {
                throw new FormatException("Neispravan PEM sertifikat.");
            }

            start += header.Length;
            var base64 = pem.Substring(start, end - start)
                .Replace("\r", "")
                .Replace("\n", "")
                .Trim();

            return Convert.FromBase64String(base64);
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
