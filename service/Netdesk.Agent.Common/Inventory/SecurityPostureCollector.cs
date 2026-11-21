using System;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography.X509Certificates;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Checks two security prerequisites the org requires on every machine:
    /// that the org-specific CA certificates are installed in the appropriate Local
    /// Machine stores, and that Secure DNS (DNS-over-HTTPS) is disabled in
    /// browsers via the same registry policy set by the
    /// "Isključi Secure DNS" (disable Secure DNS) preset. All return values are nullable -
    /// null means the check couldn't run this cycle (e.g. the
    /// server with the reference certificate was unreachable), not "definitely missing".
    /// </summary>
    public static class SecurityPostureCollector
    {
        private const string TrustedRootCertFileName = "cert_CA_SSL_DECRIPT_BOR.crt";
        private const string IntermediateCertFileName = "cert_SSL_TRUST.crt";

        public static bool? CheckTrustedRootCertInstalled(string serverBaseUrl)
            => CheckCertInstalled(serverBaseUrl, TrustedRootCertFileName, StoreName.Root);

        public static bool? CheckIntermediateCertInstalled(string serverBaseUrl)
            => CheckCertInstalled(serverBaseUrl, IntermediateCertFileName, StoreName.CertificateAuthority);

        // Split into three steps (download / parse / store-read) with
        // their own WARN per step - live on Windows 7 BOTH certificates
        // failed with the same generic "Cannot find the requested object"
        // (CryptographicException) message, which by itself doesn't say whether it's
        // parsing the downloaded file or reading the Local Machine store that fails
        // (a known, documented .NET/Windows 7 problem precisely with
        // StoreName.Root/CertificateAuthority - see DescribeException for the
        // HResult that tells them apart: CRYPT_E_NOT_FOUND=0x80092004 vs e.g.
        // access-denied=0x80070005).
        private static bool? CheckCertInstalled(string serverBaseUrl, string fileName, StoreName storeName)
        {
            if (string.IsNullOrEmpty(serverBaseUrl))
            {
                return null;
            }

            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            byte[] certBytes;
            try
            {
                using (var http = new HttpClient { BaseAddress = new Uri(serverBaseUrl) })
                {
                    certBytes = http.GetByteArrayAsync("/uploads/downloads/" + fileName).GetAwaiter().GetResult();
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Provera sertifikata (" + fileName + ") - preuzimanje referentnog fajla neuspešno: " + DescribeException(ex));
                return null;
            }

            // X509Certificate2/X509Store don't implement IDisposable before
            // .NET 4.6 (the agent targets net452) - try/finally + .Reset()/.Close()
            // instead of "using", the same pattern as UpdateManager.cs.
            X509Certificate2 refCert = null;
            string thumbprint;
            try
            {
                refCert = new X509Certificate2(certBytes);
                thumbprint = refCert.Thumbprint;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Provera sertifikata (" + fileName + ") - parsiranje preuzetog fajla kao X.509 sertifikata neuspešno: " + DescribeException(ex));
                return null;
            }
            finally
            {
                if (refCert != null) refCert.Reset();
            }

            X509Store store = null;
            try
            {
                store = new X509Store(storeName, StoreLocation.LocalMachine);
                store.Open(OpenFlags.ReadOnly);
                var matches = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, false);
                return matches.Count > 0;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Provera sertifikata (" + fileName + ") - čitanje '" + storeName + "' Local Machine store-a neuspešno: " + DescribeException(ex));
                return null;
            }
            finally
            {
                if (store != null) store.Close();
            }
        }

        private static string DescribeException(Exception ex)
        {
            return ex.GetType().Name + " (HResult=0x" + ex.HResult.ToString("X8") + "): " + ex.Message;
        }

        /// <summary>
        /// true only if ALL four browsers (Chrome/Edge/Brave via
        /// DnsOverHttpsMode="off", Firefox via DNSOverHTTPS\Enabled=0)
        /// are confirmed disabled - the same registry policy set by the
        /// "Isključi Secure DNS" (disable Secure DNS) preset. The registry read has no network
        /// dependency, so it always gives a definite answer (false, not null) when
        /// at least one browser isn't disabled or isn't configured.
        /// </summary>
        public static bool? CheckSecureDnsDisabled()
        {
            try
            {
                var chromeOff = IsChromiumDohOff(@"SOFTWARE\Policies\Google\Chrome");
                var edgeOff = IsChromiumDohOff(@"SOFTWARE\Policies\Microsoft\Edge");
                var braveOff = IsChromiumDohOff(@"SOFTWARE\Policies\BraveSoftware\Brave");
                var firefoxOff = IsFirefoxDohOff();
                return chromeOff && edgeOff && braveOff && firefoxOff;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Provera Secure DNS stanja neuspešna: " + ex.Message);
                return null;
            }
        }

        private static bool IsChromiumDohOff(string subKeyPath)
        {
            using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(subKeyPath))
            {
                var value = key?.GetValue("DnsOverHttpsMode") as string;
                return string.Equals(value, "off", StringComparison.OrdinalIgnoreCase);
            }
        }

        private static bool IsFirefoxDohOff()
        {
            using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Policies\Mozilla\Firefox\DNSOverHTTPS"))
            {
                if (key == null) return false;
                var enabled = key.GetValue("Enabled");
                return enabled is int i && i == 0;
            }
        }
    }
}
