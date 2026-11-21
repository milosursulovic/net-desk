using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.Win32;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Installed software via the registry Uninstall keys - deliberately NOT via
    /// WMI Win32_Product (a notoriously slow query that triggers an MSI consistency check,
    /// i.e. a "repair", for every package, seriously degrading machine performance).
    /// Reads both the 64-bit and 32-bit (WOW6432Node) views of HKLM.
    /// </summary>
    public static class SoftwareCollector
    {
        private const string UninstallKeyPath =
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

        private const string UninstallKeyPathWow6432 =
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

        public static List<SoftwareItem> Collect()
        {
            var result = new List<SoftwareItem>();

            ReadFromView(RegistryView.Registry64, UninstallKeyPath, result);
            ReadFromView(RegistryView.Registry32, UninstallKeyPathWow6432, result);

            return result;
        }

        private static void ReadFromView(RegistryView view, string keyPath, List<SoftwareItem> result)
        {
            try
            {
                using (var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                using (var uninstallKey = baseKey.OpenSubKey(keyPath))
                {
                    if (uninstallKey == null) return;

                    foreach (var subKeyName in uninstallKey.GetSubKeyNames())
                    {
                        using (var subKey = uninstallKey.OpenSubKey(subKeyName))
                        {
                            var item = ReadEntry(subKey);
                            if (item != null) result.Add(item);
                        }
                    }
                }
            }
            catch (PlatformNotSupportedException)
            {
                // The Registry64 view doesn't exist on a real 32-bit OS - skip.
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Čitanje instaliranog softvera neuspešno (" + keyPath + "): " + ex.Message);
            }
        }

        private static SoftwareItem ReadEntry(RegistryKey subKey)
        {
            if (subKey == null) return null;

            var displayName = subKey.GetValue("DisplayName") as string;
            if (string.IsNullOrWhiteSpace(displayName)) return null;

            // SystemComponent=1 marks internal/hidden components (e.g. update
            // packages, redistributables that Windows manages itself) - we skip
            // them just like the standard "Programs and Features" view in Control Panel.
            var systemComponent = subKey.GetValue("SystemComponent");
            if (systemComponent is int && (int)systemComponent == 1) return null;

            return new SoftwareItem
            {
                DisplayName = CleanRegistryString(displayName),
                DisplayVersion = CleanRegistryString(subKey.GetValue("DisplayVersion") as string),
                Publisher = CleanRegistryString(subKey.GetValue("Publisher") as string),
                InstallDate = ParseInstallDate(subKey.GetValue("InstallDate") as string),
            };
        }

        /// <summary>
        /// Discovered live: some driver installers (e.g. the BIXOLON printer
        /// driver) write fixed-size buffers into the registry without a proper null
        /// terminator at the end of the used part - RegistryKey.GetValue strips
        /// ONLY ONE trailing null character, so hundreds of remaining "\0" bytes
        /// arrive here as part of the "string". Everything after the FIRST null byte is discarded
        /// before sending to the backend, which has narrow varchar columns ("Data too long"
        /// broke the whole insert live, not just that one row).
        /// </summary>
        private static string CleanRegistryString(string raw)
        {
            if (raw == null) return null;
            var nulIndex = raw.IndexOf('\0');
            return (nulIndex >= 0 ? raw.Substring(0, nulIndex) : raw).Trim();
        }

        /// <summary>
        /// The registry usually stores InstallDate as "yyyymmdd", but some installers
        /// write a completely different/invalid format (seen live: a plain number
        /// like "1784235052", nothing like a date). The backend writes this into a MySQL
        /// DATE column - returning the raw unrecognized value would break the whole
        /// insert (confirmed by live testing). When the format isn't recognized,
        /// we return null - "unknown install date" is a legitimate state,
        /// the column is nullable.
        /// </summary>
        private static string ParseInstallDate(string raw)
        {
            if (string.IsNullOrEmpty(raw) || raw.Length != 8) return null;

            DateTime parsed;
            if (DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
            {
                return parsed.ToString("yyyy-MM-dd");
            }

            return null;
        }
    }
}
