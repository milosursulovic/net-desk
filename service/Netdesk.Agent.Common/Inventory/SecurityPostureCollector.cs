using System;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography.X509Certificates;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Proverava dva bezbednosna preduslova koje org zahteva na svakoj mašini:
    /// da su org-specifični CA sertifikati instalirani u odgovarajuće Local
    /// Machine store-ove, i da je Secure DNS (DNS-over-HTTPS) isključen u
    /// pregledačima preko iste registry politike koju postavlja
    /// "Isključi Secure DNS" preset. Sve povratne vrednosti su nullable -
    /// null znači da provera nije mogla da se izvrši ovog ciklusa (npr.
    /// server sa referentnim sertifikatom nedostupan), ne "sigurno nedostaje".
    /// </summary>
    public static class SecurityPostureCollector
    {
        private const string TrustedRootCertFileName = "cert_CA_SSL_DECRIPT_BOR.crt";
        private const string IntermediateCertFileName = "cert_SSL_TRUST.crt";

        public static bool? CheckTrustedRootCertInstalled(string serverBaseUrl)
            => CheckCertInstalled(serverBaseUrl, TrustedRootCertFileName, StoreName.Root);

        public static bool? CheckIntermediateCertInstalled(string serverBaseUrl)
            => CheckCertInstalled(serverBaseUrl, IntermediateCertFileName, StoreName.CertificateAuthority);

        private static bool? CheckCertInstalled(string serverBaseUrl, string fileName, StoreName storeName)
        {
            if (string.IsNullOrEmpty(serverBaseUrl))
            {
                return null;
            }

            X509Certificate2 refCert = null;
            X509Store store = null;
            try
            {
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

                byte[] certBytes;
                using (var http = new HttpClient { BaseAddress = new Uri(serverBaseUrl) })
                {
                    certBytes = http.GetByteArrayAsync("/uploads/downloads/" + fileName).GetAwaiter().GetResult();
                }

                // X509Certificate2/X509Store ne implementiraju IDisposable pre
                // .NET 4.6 (agent cilja net452) - try/finally + .Reset()/.Close()
                // umesto "using", isti obrazac kao UpdateManager.cs.
                refCert = new X509Certificate2(certBytes);
                var thumbprint = refCert.Thumbprint;

                store = new X509Store(storeName, StoreLocation.LocalMachine);
                store.Open(OpenFlags.ReadOnly);
                var matches = store.Certificates.Find(X509FindType.FindByThumbprint, thumbprint, false);
                return matches.Count > 0;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Provera sertifikata (" + fileName + ") neuspešna: " + ex.Message);
                return null;
            }
            finally
            {
                if (store != null) store.Close();
                if (refCert != null) refCert.Reset();
            }
        }

        /// <summary>
        /// true samo ako su SVA četiri pregledača (Chrome/Edge/Brave preko
        /// DnsOverHttpsMode="off", Firefox preko DNSOverHTTPS\Enabled=0)
        /// potvrđeno isključena - ista registry politika koju postavlja
        /// "Isključi Secure DNS" preset. Registry čitanje nema mrežnu
        /// zavisnost pa uvek daje određen odgovor (false, ne null) kad
        /// bar jedan pregledač nije isključen ili nije konfigurisan.
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
