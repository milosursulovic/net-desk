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
    /// Orchestrates the check/download/SHA-256 verification/digital signature
    /// of a new version and handing it off to NetdeskAgentManager (via
    /// ManagerCommandClient) to perform the actual file swap and restart.
    /// The file swap itself is NOT here - the Manager does that as a separate, persistent
    /// service, because NetdeskAgent.Service.exe must not (and can't, while the file is in
    /// use) change its own executable while it's running.
    ///
    /// Security: SHA-256 integrity is always checked. The digital signature is
    /// checked IF it's sent - the organization already has an internal CA distributed
    /// into the trusted root store of all managed computers (already used for HTTPS
    /// to the Netdesk server), so the signing certificate's chain is verified via
    /// X509Chain against that same trusted root - no need for separate
    /// distribution of a public key to the agent.
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
        /// Forced reinstall of a specific release (force_reinstall_agent
        /// job, see AgentWorker.ProcessJobAsync) - WITHOUT the isNewerVersion check,
        /// it can "reinstall" even the version the agent ALREADY claims to be on (e.g.
        /// repairing a damaged install without changing the version number). The digital
        /// signature is NOT checked here - the job payload doesn't carry a signature/certificate
        /// (the admin explicitly picked this release from the trusted admin
        /// UI through the authenticated job mechanism) - SHA-256 integrity
        /// still ALWAYS applies.
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
                    // VerifySignatureIfPresent has already logged the exact reason.
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
        /// Returns true if the signature is valid OR if there's no signature to check
        /// (the server has no signing configured for this release, or the
        /// reinstall was forced via a job that doesn't carry a signature). Returns
        /// false ONLY when a signature WAS passed and verification (the chain or the
        /// signature itself) fails - then the update is reliably rejected.
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

            // Note on .NET Framework 4.5.2 compatibility: X509Certificate2 and
            // X509Chain do NOT implement IDisposable before .NET 4.6 - "using" on
            // them is a compile error on real net452 (discovered only via
            // a real MSBuild with the real reference assemblies; the runtime GAC
            // DLLs used for the earlier csc.exe check were more lenient). That's why
            // try/finally + .Reset() is used here instead of "using".
            X509Certificate2 cert = null;
            try
            {
                var certBytes = PemToDer(signatureCertificatePem);
                cert = new X509Certificate2(certBytes);

                if (!VerifyChainToTrustedRoot(cert))
                {
                    return false;
                }

                // We use neither X509Certificate2.GetRSAPublicKey() nor
                // RSA.VerifyData(byte[], byte[], HashAlgorithmName,
                // RSASignaturePadding) - both were only added in .NET 4.6.
                // We use the older RSACryptoServiceProvider API that has
                // existed since .NET 1.0.
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
                // NoCheck because the organization most likely has no CRL/OCSP
                // infrastructure for the internal CA - checking the chain up to the
                // trusted root by itself still remains meaningful protection.
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
                // best-effort cleanup of the temporary .zip file
            }
        }
    }
}
