using System.Collections.Generic;
using System.Management;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    public static class ServiceCollector
    {
        public static List<ServiceItem> Collect()
        {
            var result = new List<ServiceItem>();

            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT Name, DisplayName, State, StartMode, StartName, PathName FROM Win32_Service"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            result.Add(new ServiceItem
                            {
                                Name = WmiUtils.GetString(mo, "Name"),
                                DisplayName = WmiUtils.GetString(mo, "DisplayName"),
                                State = WmiUtils.GetString(mo, "State"),
                                StartMode = WmiUtils.GetString(mo, "StartMode"),
                                StartName = WmiUtils.GetString(mo, "StartName"),
                                PathName = WmiUtils.GetString(mo, "PathName"),
                            });
                        }
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("Čitanje servisa neuspešno: " + ex.Message);
            }

            return result;
        }
    }
}
