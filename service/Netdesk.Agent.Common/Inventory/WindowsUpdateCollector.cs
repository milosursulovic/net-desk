using System;
using System.Collections.Generic;
using System.Management;
using Microsoft.Win32;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    public static class WindowsUpdateCollector
    {
        public static List<InstalledUpdateItem> CollectInstalled()
        {
            var result = new List<InstalledUpdateItem>();

            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT Description, HotFixID, InstalledOn, InstalledBy FROM Win32_QuickFixEngineering"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            result.Add(new InstalledUpdateItem
                            {
                                Description = WmiUtils.GetString(mo, "Description"),
                                HotFixId = WmiUtils.GetString(mo, "HotFixID"),
                                InstalledOn = WmiUtils.GetString(mo, "InstalledOn"),
                                InstalledBy = WmiUtils.GetString(mo, "InstalledBy"),
                            });
                        }
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("Čitanje instaliranih zakrpa neuspešno: " + ex.Message);
            }

            return result;
        }

        public static WindowsUpdateInfo CollectServiceInfo()
        {
            return new WindowsUpdateInfo
            {
                ServiceStatus = GetWuauservState(),
                LastCheckAt = GetLastSuccessfulCheckTime(),
            };
        }

        /// <summary>
        /// Available (not installed) patches via the Windows Update Agent COM API
        /// (Microsoft.Update.Session) - WMI doesn't expose them, only the Update Agent
        /// knows about PENDING patches. Late-bound COM (dynamic) so it doesn't require a WUApi
        /// interop reference in the project. The search can be slow (seconds to
        /// tens of seconds, depending on WSUS/network) - which is why it's called on a longer
        /// interval (UpdateCheckIntervalSeconds), not on every heartbeat.
        /// </summary>
        public static List<AvailableUpdateItem> CollectAvailable()
        {
            var result = new List<AvailableUpdateItem>();

            try
            {
                var sessionType = Type.GetTypeFromProgID("Microsoft.Update.Session");
                if (sessionType == null)
                {
                    FileLogger.Warn("Microsoft.Update.Session COM klasa nije dostupna na ovom sistemu.");
                    return result;
                }

                dynamic session = Activator.CreateInstance(sessionType);
                dynamic searcher = session.CreateUpdateSearcher();
                dynamic searchResult = searcher.Search("IsInstalled=0 and IsHidden=0 and Type='Software'");

                foreach (dynamic update in searchResult.Updates)
                {
                    result.Add(new AvailableUpdateItem
                    {
                        KbId = ExtractFirstKbId(update),
                        Title = (string)update.Title,
                        Severity = update.MsrcSeverity as string,
                    });
                }
            }
            catch (Exception ex)
            {
                // COM errors here (WU service disabled, no network to Windows
                // Update...) are expected and must not bring down the cycle.
                FileLogger.Warn("Provera dostupnih Windows update-a neuspešna: " + ex.Message);
            }

            return result;
        }

        private static string ExtractFirstKbId(dynamic update)
        {
            try
            {
                foreach (var id in update.KBArticleIDs)
                {
                    return "KB" + id;
                }
            }
            catch
            {
                // not every item contains a KB number
            }

            return null;
        }

        private static string GetWuauservState()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT State FROM Win32_Service WHERE Name = 'wuauserv'"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            return WmiUtils.GetString(mo, "State");
                        }
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("Provera statusa Windows Update servisa neuspešna: " + ex.Message);
            }

            return null;
        }

        private static string GetLastSuccessfulCheckTime()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Detect"))
                {
                    var raw = key == null ? null : key.GetValue("LastSuccessTime") as string;
                    if (string.IsNullOrEmpty(raw)) return null;

                    DateTime parsed;
                    return DateTime.TryParse(raw, out parsed)
                        ? parsed.ToUniversalTime().ToString("o")
                        : raw;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Čitanje poslednje provere Windows Update-a neuspešno: " + ex.Message);
                return null;
            }
        }
    }
}
