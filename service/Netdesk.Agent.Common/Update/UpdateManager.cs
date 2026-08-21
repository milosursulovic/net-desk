using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Threading.Tasks;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Http;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Manager;

namespace NetdeskAgent.Common.Update
{
    /// <summary>
    /// Orkestrira proveru/preuzimanje/SHA-256 verifikaciju/digitalni potpis
    /// nove verzije i prosleđivanje NetdeskAgentManager-u (preko
    /// ManagerCommandClient) da izvrši stvarnu zamenu fajlova i restart.
    /// Sama zamena fajlova NIJE ovde - to radi Manager kao odvojen, trajan
    /// servis, jer NetdeskAgent.Service.exe ne sme (i ne može, dok je fajl u
    /// upotrebi) da menja sopstveni izvršni fajl dok je pokrenut.
    ///
    /// Bezbednost: SHA-256 integritet se uvek proverava. Digitalni potpis se
    /// proverava AKO je poslat - organizacija već ima internu CA distribuiranu
    /// u trusted root store svih upravljanih računara (koristi se već za HTTPS
    /// ka Netdesk serveru), pa se lanac potpisnog sertifikata proverava preko
    /// X509Chain protiv te iste trusted root - nema potrebe za posebnom
    /// distribucijom javnog ključa agentu.
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

            await DownloadVerifyAndHandOffAsync(
                client, state, currentVersion, check.Version, check.Sha256,
                check.Signature, check.SignatureCertificatePem, check.DownloadUrl).ConfigureAwait(false);
        }

        /// <summary>
        /// Forsirana reinstalacija konkretnog release-a (force_reinstall_agent
        /// job, videti AgentWorker.ProcessJobAsync) - BEZ isNewerVersion provere,
        /// može "reinstalirati" i verziju na kojoj agent VEĆ tvrdi da je (npr.
        /// popravka oštećene instalacije bez menjanja broja verzije). Digitalni
        /// potpis se NE proverava ovde - job payload ne nosi potpis/sertifikat
        /// (admin je eksplicitno izabrao ovaj release iz poverljivog admin
        /// UI-ja preko autentifikovanog job mehanizma) - SHA-256 integritet i
        /// dalje OBAVEZNO važi.
        /// </summary>
        public static async Task ForceInstallAsync(
            NetdeskApiClient client, AgentState state, string currentVersion,
            long releaseId, string toVersion, string sha256)
        {
            var downloadUrl = "/api/agents/update/download/" + releaseId;

            await DownloadVerifyAndHandOffAsync(
                client, state, currentVersion, toVersion, sha256,
                null, null, downloadUrl).ConfigureAwait(false);
        }

        private static async Task DownloadVerifyAndHandOffAsync(
            NetdeskApiClient client,
            AgentState state,
            string fromVersion,
            string toVersion,
            string sha256,
            string signature,
            string signatureCertificatePem,
            string downloadUrl)
        {
            var updateRoot = Path.Combine(Paths.DataDir, "update-staging");
            Directory.CreateDirectory(updateRoot);

            var packagePath = Path.Combine(updateRoot, toVersion + ".zip");
            var stagingDir = Path.Combine(updateRoot, toVersion);

            try
            {
                await client.DownloadUpdateFileAsync(state.AgentId, state.ApiKey, downloadUrl, packagePath)
                    .ConfigureAwait(false);

                if (!VerifySha256(packagePath, sha256))
                {
                    FileLogger.Error(
                        "SHA-256 provera paketa neuspešna (mogući problem integriteta) - update se odbacuje.", null);
                    return;
                }

                if (!VerifySignatureIfPresent(packagePath, signature, signatureCertificatePem))
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

                var command = new ManagerCommand
                {
                    Action = "install_files",
                    ServiceName = "NetdeskAgent",
                    StagingDir = stagingDir,
                    InstallDir = installDir,
                    // WebRtcBridge.exe (Webrtc/SessionLauncher.cs) - ako je
                    // WebRTC sesija aktivna tokom update-a, drži zaključane
                    // DLL-ove iz ovog istog Service foldera (SIPSorcery,
                    // SharpDX...) potencijalno minutima, daleko duže od
                    // Manager-ovog kratkog retry prozora - vidi
                    // ManagerCommand.KillProcessNames za pun kontekst.
                    KillProcessNames = new[] { "Netdesk.Agent.WebRtcBridge" },
                    ServerBaseUrl = client.BaseUrl,
                    AgentId = state.AgentId,
                    ApiKey = state.ApiKey,
                    FromVersion = fromVersion,
                    ToVersion = toVersion,
                };

                string failureReason;
                if (ManagerCommandClient.TrySend(command, out failureReason))
                {
                    FileLogger.Info("Instalacija verzije " + toVersion + " prosleđena NetdeskAgentManager-u.");
                }
                else
                {
                    FileLogger.Error("Prosleđivanje instalacije Manager-u neuspešno: " + failureReason, null);
                }
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
        /// Vraća true ako je potpis validan ILI ako nema potpisa za proveru
        /// (server nema podešeno potpisivanje za ovaj release, ili je
        /// reinstalacija forsirana preko job-a koji ne nosi potpis). Vraća
        /// false SAMO kad JE potpis prosleđen, a verifikacija (lanac ili sam
        /// potpis) ne uspe - tada se update pouzdano odbacuje.
        /// </summary>
        private static bool VerifySignatureIfPresent(string filePath, string signature, string signatureCertificatePem)
        {
            if (string.IsNullOrEmpty(signature) || string.IsNullOrEmpty(signatureCertificatePem))
            {
                FileLogger.Warn(
                    "Nema digitalnog potpisa za proveru (server nema podešeno potpisivanje za ovaj release, ili je " +
                    "reinstalacija forsirana bez potpisa) - preskačem proveru potpisa.");
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
                var certBytes = PemToDer(signatureCertificatePem);
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
                var signatureBytes = Convert.FromBase64String(signature);

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
