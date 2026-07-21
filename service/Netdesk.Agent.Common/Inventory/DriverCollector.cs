using System.Collections.Generic;
using System.Management;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    public static class DriverCollector
    {
        public static List<DriverItem> Collect()
        {
            var result = new List<DriverItem>();

            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT DeviceName, DriverVersion, DriverDate, Manufacturer, DriverProviderName FROM Win32_PnPSignedDriver " +
                    "WHERE DeviceName IS NOT NULL"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            result.Add(new DriverItem
                            {
                                DeviceName = WmiUtils.GetString(mo, "DeviceName"),
                                DriverVersion = WmiUtils.GetString(mo, "DriverVersion"),
                                DriverDate = WmiUtils.GetDateTimeIso(mo, "DriverDate"),
                                Manufacturer = WmiUtils.GetString(mo, "Manufacturer"),
                                DriverProviderName = WmiUtils.GetString(mo, "DriverProviderName"),
                            });
                        }
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("Čitanje drajvera neuspešno: " + ex.Message);
            }

            return result;
        }
    }
}
