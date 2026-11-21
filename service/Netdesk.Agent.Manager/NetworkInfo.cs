using System;
using System.Linq;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own minimal version of what Netdesk.Agent.Common's
    /// HardwareCollector does for the primary IPv4 - the Manager must not
    /// reference Common (see the decoupling note on DirectorySync.cs),
    /// so there's no point in sharing that chain of fallbacks. "The first
    /// active, non-loopback IPv4 address" is enough - the Manager's enroll uses this
    /// only to resolve ip_entry_id on the backend, not for anything more sensitive.
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
                // Best-effort - returns null, the caller (EnsureEnrolledAsync)
                // skips the enroll attempt until the network is ready.
            }

            return null;
        }
    }
}
