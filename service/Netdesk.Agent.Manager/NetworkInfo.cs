using System;
using System.Linq;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena, minimalna verzija onoga što Netdesk.Agent.Common's
    /// HardwareCollector radi za primarnu IPv4 - Manager ne sme da
    /// referencira Common (videti decoupling napomenu na DirectorySync.cs),
    /// pa nema smisla deliti taj lanac fallback-ova. Dovoljno je "prva
    /// aktivna, ne-loopback IPv4 adresa" - Manager-ov enroll koristi ovo
    /// samo da razreši ip_entry_id na backend-u, ne za bilo šta osetljivije.
    /// </summary>
    internal static class NetworkInfo
    {
        public static string GetHostname()
        {
            return Environment.MachineName;
        }

        public static string GetPrimaryIPv4()
        {
            try
            {
                foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus != OperationalStatus.Up) continue;
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;

                    var props = nic.GetIPProperties();
                    var addr = props.UnicastAddresses
                        .Select(a => a.Address)
                        .FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork);

                    if (addr != null) return addr.ToString();
                }
            }
            catch
            {
                // Best-effort - vraća null, pozivalac (EnsureEnrolledAsync)
                // preskače enroll pokušaj dok mreža ne bude spremna.
            }

            return null;
        }
    }
}
