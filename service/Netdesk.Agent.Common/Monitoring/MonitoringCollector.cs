using System;
using System.Management;
using Microsoft.Win32;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Models;

namespace NetdeskAgent.Common.Monitoring
{
    /// <summary>
    /// Prikuplja MonitoringData za heartbeat payload (spec 11.8). Svaki signal
    /// je best-effort - AV/BitLocker/temperatura posebno variraju po OEM-u/
    /// ediciji Windows-a i očekivano je da ponekad ne uspeju.
    /// AntivirusStatus/FirewallStatus vraćaju samo "enabled"/"disabled"/"unknown"
    /// (dogovor sa backend alerting pravilima - videti backend memoriju).
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
                // root\SecurityCenter2 postoji od Vista/Win7 nadalje, ali upit
                // može da otkaže ako nema registrovanog AV proizvoda ili je
                // servis nedostupan.
                FileLogger.Warn("Antivirus status očitavanje neuspešno: " + ex.Message);
            }

            return "unknown";
        }

        private static bool IsRealTimeProtectionEnabled(int productState)
        {
            // Microsoft ovo polje ne dokumentuje zvanično, ali je uveliko
            // ustaljeno tumačenje (sysadmin zajednica): srednji bajt WMI
            // SecurityCenter2 productState vrednosti nosi status real-time
            // zaštite - 0x10/0x11 = uključena. Best-effort heuristika.
            var middleByte = (productState >> 8) & 0xFF;
            return middleByte == 0x10 || middleByte == 0x11;
        }

        /// <summary>
        /// Čita iz registry-ja (ne 'netsh advfirewall show ... state') jer je
        /// netsh tekstualni izlaz lokalizovan (npr. na srpskom Windows-u "ON"/
        /// "OFF" i "State" ne bi bili ti stringovi) - registry vrednost je
        /// stabilna nezavisno od jezika sistema. Proverava StandardProfile kao
        /// reprezentativan profil (najčešći slučaj za mašine van domena).
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
                // Namespace ne postoji ako BitLocker feature nije instaliran,
                // ili upit zahteva prava koja ni LocalSystem ponekad nema na
                // starijim/Home edicijama - očekivano na mnogim mašinama.
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
                // MSAcpi_ThermalZoneTemperature često nije implementiran od
                // strane OEM-a - potpuno očekivano da ovo ne uspe na mnogim
                // mašinama (posebno desktop/server bez ACPI termalne zone).
                FileLogger.Warn("Temperatura očitavanje neuspešna (očekivano na mnogim mašinama): " + ex.Message);
            }

            return null;
        }
    }
}
