using System;
using System.Management;
using Microsoft.Win32;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Models;

namespace NetdeskAgent.Common.Monitoring
{
    /// <summary>
    /// Collects MonitoringData for the heartbeat payload (spec 11.8). Every signal
    /// is best-effort - AV/BitLocker/temperature in particular vary by OEM/
    /// Windows edition and are expected to fail sometimes.
    /// AntivirusStatus/FirewallStatus return only "enabled"/"disabled"/"unknown"
    /// (an agreement with the backend alerting rules - see the backend memory).
    /// </summary>
    public static class MonitoringCollector
    {
        public static MonitoringData Collect()
        {
            double? diskUsedPct, diskFreeGb;
            CollectDiskAggregate(out diskUsedPct, out diskFreeGb);

            return new MonitoringData
            {
                CpuLoadPct = CollectCpuLoad(),
                RamLoadPct = CollectRamLoad(),
                DiskUsedPct = diskUsedPct,
                DiskFreeGb = diskFreeGb,
                NetworkConnected = HardwareCollector.GetPrimaryIPv4() != null,
                AntivirusStatus = CollectAntivirusStatus(),
                FirewallStatus = CollectFirewallStatus(),
                BitlockerStatus = CollectBitlockerStatus(),
                TemperatureC = CollectTemperature(),
            };
        }

        private static double? CollectCpuLoad()
        {
            try
            {
                double sum = 0;
                var count = 0;

                using (var searcher = new ManagementObjectSearcher("SELECT LoadPercentage FROM Win32_Processor"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var v = WmiUtils.GetDouble(mo, "LoadPercentage");
                            if (v.HasValue)
                            {
                                sum += v.Value;
                                count++;
                            }
                        }
                    }
                }

                return count > 0 ? (double?)Math.Round(sum / count, 1) : null;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("CPU load očitavanje neuspešno: " + ex.Message);
                return null;
            }
        }

        private static double? CollectRamLoad()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT TotalVisibleMemorySize, FreePhysicalMemory FROM Win32_OperatingSystem"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var total = WmiUtils.GetDouble(mo, "TotalVisibleMemorySize");
                            var free = WmiUtils.GetDouble(mo, "FreePhysicalMemory");

                            if (total.HasValue && free.HasValue && total.Value > 0)
                            {
                                return Math.Round((total.Value - free.Value) / total.Value * 100, 1);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("RAM load očitavanje neuspešno: " + ex.Message);
            }

            return null;
        }

        private static void CollectDiskAggregate(out double? usedPct, out double? freeGb)
        {
            usedPct = null;
            freeGb = null;

            try
            {
                double totalSize = 0;
                double totalFree = 0;

                using (var searcher = new ManagementObjectSearcher(
                    "SELECT Size, FreeSpace FROM Win32_LogicalDisk WHERE DriveType = 3"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var size = WmiUtils.GetDouble(mo, "Size");
                            var free = WmiUtils.GetDouble(mo, "FreeSpace");

                            if (size.HasValue) totalSize += size.Value;
                            if (free.HasValue) totalFree += free.Value;
                        }
                    }
                }

                if (totalSize > 0)
                {
                    usedPct = Math.Round((totalSize - totalFree) / totalSize * 100, 1);
                    freeGb = Math.Round(totalFree / 1024 / 1024 / 1024, 1);
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Disk iskorišćenost očitavanje neuspešno: " + ex.Message);
            }
        }

        private static string CollectAntivirusStatus()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    @"root\SecurityCenter2", "SELECT productState FROM AntiVirusProduct"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var state = WmiUtils.GetInt(mo, "productState");
                            if (state.HasValue)
                            {
                                return IsRealTimeProtectionEnabled(state.Value) ? "enabled" : "disabled";
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // root\SecurityCenter2 exists from Vista/Win7 onwards, but the query
                // can fail if there's no registered AV product or the
                // service is unavailable.
                FileLogger.Warn("Antivirus status očitavanje neuspešno: " + ex.Message);
            }

            return "unknown";
        }

        private static bool IsRealTimeProtectionEnabled(int productState)
        {
            // Microsoft doesn't officially document this field, but it's a widely
            // established interpretation (the sysadmin community): the middle byte of the WMI
            // SecurityCenter2 productState value carries the real-time
            // protection status - 0x10/0x11 = enabled. A best-effort heuristic.
            var middleByte = (productState >> 8) & 0xFF;
            return middleByte == 0x10 || middleByte == 0x11;
        }

        /// <summary>
        /// Reads from the registry (not 'netsh advfirewall show ... state') because
        /// netsh's text output is localized (e.g. on Serbian Windows "ON"/
        /// "OFF" and "State" wouldn't be those strings) - the registry value is
        /// stable regardless of the system language. Checks StandardProfile as the
        /// representative profile (the most common case for machines outside a domain).
        /// </summary>
        private static string CollectFirewallStatus()
        {
            try
            {
                using (var key = Registry.LocalMachine.OpenSubKey(
                    @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile"))
                {
                    var value = key == null ? null : key.GetValue("EnableFirewall");
                    if (value is int)
                    {
                        return (int)value == 1 ? "enabled" : "disabled";
                    }
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Firewall status očitavanje neuspešno: " + ex.Message);
            }

            return "unknown";
        }

        private static string CollectBitlockerStatus()
        {
            try
            {
                var systemDrive = Environment.GetEnvironmentVariable("SystemDrive");
                if (string.IsNullOrEmpty(systemDrive)) return "unknown";

                using (var searcher = new ManagementObjectSearcher(
                    @"root\CIMV2\Security\MicrosoftVolumeEncryption",
                    "SELECT ProtectionStatus FROM Win32_EncryptableVolume WHERE DriveLetter = '" + systemDrive + "'"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var status = WmiUtils.GetInt(mo, "ProtectionStatus");
                            if (status.HasValue)
                            {
                                return status.Value == 1 ? "on" : "off";
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // The namespace doesn't exist if the BitLocker feature isn't installed,
                // or the query requires rights that even LocalSystem sometimes lacks on
                // older/Home editions - expected on many machines.
                FileLogger.Warn("BitLocker status očitavanje neuspešno: " + ex.Message);
            }

            return "unknown";
        }

        private static double? CollectTemperature()
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    @"root\WMI", "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            var tenthsKelvin = WmiUtils.GetDouble(mo, "CurrentTemperature");
                            if (tenthsKelvin.HasValue)
                            {
                                return Math.Round(tenthsKelvin.Value / 10 - 273.15, 1);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // MSAcpi_ThermalZoneTemperature is often not implemented by
                // the OEM - it's entirely expected for this to fail on many
                // machines (especially desktops/servers without an ACPI thermal zone).
                FileLogger.Warn("Temperatura očitavanje neuspešna (očekivano na mnogim mašinama): " + ex.Message);
            }

            return null;
        }
    }
}
