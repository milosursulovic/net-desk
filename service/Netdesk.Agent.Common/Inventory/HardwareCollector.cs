using System;
using System.Collections.Generic;
using System.Management;
using System.Net;
using System.Net.Sockets;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// WMI-bazirano prikupljanje hardverskog/OS inventara (spec 11.3). Svaka
    /// metoda je best-effort: WMI upit koji ne uspe (repozitorijum oštećen,
    /// klasa ne postoji na starijem OS-u...) loguje upozorenje i vraća
    /// null/praznu listu umesto da obori ceo inventory sync ciklus.
    /// </summary>
    public static class HardwareCollector
    {
        public static OsInfo CollectOs()
        {
            using (var mo = QueryFirst("SELECT Caption, Version, BuildNumber, InstallDate FROM Win32_OperatingSystem"))
            {
                if (mo == null) return null;
                return new OsInfo
                {
                    Caption = WmiUtils.GetString(mo, "Caption"),
                    Version = WmiUtils.GetString(mo, "Version"),
                    Build = WmiUtils.GetString(mo, "BuildNumber"),
                    InstallDate = WmiUtils.GetDateTimeIso(mo, "InstallDate"),
                };
            }
        }

        public static SystemHardwareInfo CollectSystem()
        {
            using (var mo = QueryFirst("SELECT Manufacturer, Model, TotalPhysicalMemory FROM Win32_ComputerSystem"))
            {
                if (mo == null) return null;
                var totalBytes = WmiUtils.GetDouble(mo, "TotalPhysicalMemory");
                return new SystemHardwareInfo
                {
                    Manufacturer = WmiUtils.GetString(mo, "Manufacturer"),
                    Model = WmiUtils.GetString(mo, "Model"),
                    TotalRamGb = BytesToGb(totalBytes),
                };
            }
        }

        public static MotherboardInfo CollectMotherboard()
        {
            using (var mo = QueryFirst("SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard"))
            {
                if (mo == null) return null;
                return new MotherboardInfo
                {
                    Manufacturer = WmiUtils.GetString(mo, "Manufacturer"),
                    Product = WmiUtils.GetString(mo, "Product"),
                    Serial = WmiUtils.GetString(mo, "SerialNumber"),
                };
            }
        }

        public static BiosInfo CollectBios()
        {
            using (var mo = QueryFirst("SELECT Manufacturer, SMBIOSBIOSVersion, ReleaseDate FROM Win32_BIOS"))
            {
                if (mo == null) return null;
                return new BiosInfo
                {
                    Vendor = WmiUtils.GetString(mo, "Manufacturer"),
                    Version = WmiUtils.GetString(mo, "SMBIOSBIOSVersion"),
                    ReleaseDate = WmiUtils.GetDateTimeIso(mo, "ReleaseDate"),
                };
            }
        }

        public static CpuInfo CollectCpu()
        {
            using (var mo = QueryFirst(
                "SELECT Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed, SocketDesignation FROM Win32_Processor"))
            {
                if (mo == null) return null;
                return new CpuInfo
                {
                    Name = WmiUtils.GetString(mo, "Name"),
                    Cores = WmiUtils.GetInt(mo, "NumberOfCores"),
                    LogicalCpus = WmiUtils.GetInt(mo, "NumberOfLogicalProcessors"),
                    MaxClockMHz = WmiUtils.GetInt(mo, "MaxClockSpeed"),
                    Socket = WmiUtils.GetString(mo, "SocketDesignation"),
                };
            }
        }

        public static List<RamModuleInfo> CollectRamModules()
        {
            var result = new List<RamModuleInfo>();

            foreach (var mo in QueryAll(
                "SELECT DeviceLocator, Manufacturer, PartNumber, SerialNumber, Capacity, Speed, FormFactor FROM Win32_PhysicalMemory"))
            {
                using (mo)
                {
                    result.Add(new RamModuleInfo
                    {
                        Slot = WmiUtils.GetString(mo, "DeviceLocator"),
                        Manufacturer = WmiUtils.GetString(mo, "Manufacturer"),
                        PartNumber = WmiUtils.GetString(mo, "PartNumber"),
                        Serial = WmiUtils.GetString(mo, "SerialNumber"),
                        CapacityGB = BytesToGb(WmiUtils.GetDouble(mo, "Capacity")),
                        SpeedMTps = WmiUtils.GetInt(mo, "Speed"),
                        FormFactor = FormFactorToString(WmiUtils.GetInt(mo, "FormFactor")),
                    });
                }
            }

            return result;
        }

        public static List<StorageInfo> CollectStorage()
        {
            return TryCollectStorageViaMsft() ?? CollectStorageViaDiskDrive();
        }

        public static List<GpuInfo> CollectGpus()
        {
            var result = new List<GpuInfo>();

            foreach (var mo in QueryAll("SELECT Name, DriverVersion, AdapterRAM FROM Win32_VideoController"))
            {
                using (mo)
                {
                    var vramBytes = WmiUtils.GetDouble(mo, "AdapterRAM");
                    result.Add(new GpuInfo
                    {
                        Name = WmiUtils.GetString(mo, "Name"),
                        DriverVersion = WmiUtils.GetString(mo, "DriverVersion"),
                        VramGB = vramBytes.HasValue && vramBytes.Value > 0 ? BytesToGb(vramBytes) : null,
                    });
                }
            }

            return result;
        }

        public static List<NicInfo> CollectNics()
        {
            var result = new List<NicInfo>();
            var speedByIndex = new Dictionary<uint, long?>();

            foreach (var mo in QueryAll("SELECT Index, Speed FROM Win32_NetworkAdapter WHERE NetConnectionStatus = 2"))
            {
                using (mo)
                {
                    var idx = WmiUtils.GetInt(mo, "Index");
                    if (!idx.HasValue) continue;

                    var speedBps = WmiUtils.GetDouble(mo, "Speed");
                    speedByIndex[(uint)idx.Value] = speedBps.HasValue ? (long?)(speedBps.Value / 1000 / 1000) : null;
                }
            }

            foreach (var mo in QueryAll(
                "SELECT Index, Description, MACAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE"))
            {
                using (mo)
                {
                    var idx = WmiUtils.GetInt(mo, "Index");
                    long? speed = null;
                    if (idx.HasValue) speedByIndex.TryGetValue((uint)idx.Value, out speed);

                    result.Add(new NicInfo
                    {
                        Name = WmiUtils.GetString(mo, "Description"),
                        Mac = WmiUtils.GetString(mo, "MACAddress"),
                        SpeedMbps = speed,
                    });
                }
            }

            return result;
        }

        public static List<PrinterItem> CollectPrinters()
        {
            var result = new List<PrinterItem>();

            foreach (var mo in QueryAll("SELECT Name, DriverName, PortName, Default, Status FROM Win32_Printer"))
            {
                using (mo)
                {
                    result.Add(new PrinterItem
                    {
                        Name = WmiUtils.GetString(mo, "Name"),
                        DriverName = WmiUtils.GetString(mo, "DriverName"),
                        PortName = WmiUtils.GetString(mo, "PortName"),
                        Status = WmiUtils.GetString(mo, "Status"),
                        IsDefault = WmiUtils.GetBool(mo, "Default"),
                    });
                }
            }

            return result;
        }

        /// <summary>Prva ne-loopback IPv4 adresa aktivnog adaptera - "ip" u inventory payload-u.</summary>
        public static string GetPrimaryIPv4()
        {
            foreach (var mo in QueryAll("SELECT IPAddress FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE"))
            {
                using (mo)
                {
                    var addresses = mo["IPAddress"] as string[];
                    if (addresses == null) continue;

                    foreach (var addr in addresses)
                    {
                        IPAddress parsed;
                        if (IPAddress.TryParse(addr, out parsed) &&
                            parsed.AddressFamily == AddressFamily.InterNetwork &&
                            !IPAddress.IsLoopback(parsed))
                        {
                            return addr;
                        }
                    }
                }
            }

            return null;
        }

        private static List<StorageInfo> TryCollectStorageViaMsft()
        {
            // MSFT_PhysicalDisk (root\Microsoft\Windows\Storage) postoji od
            // Windows 8 / Server 2012 nadalje - na Windows 7 ovaj namespace ne
            // postoji i upit baca izuzetak; tada se koristi Win32_DiskDrive
            // fallback (bez pouzdane SSD/HDD detekcije).
            try
            {
                var result = new List<StorageInfo>();

                using (var searcher = new ManagementObjectSearcher(
                    @"root\Microsoft\Windows\Storage",
                    "SELECT Model, SerialNumber, FirmwareVersion, Size, MediaType, BusType FROM MSFT_PhysicalDisk"))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        using (mo)
                        {
                            result.Add(new StorageInfo
                            {
                                Model = WmiUtils.GetString(mo, "Model"),
                                Serial = WmiUtils.GetString(mo, "SerialNumber"),
                                Firmware = WmiUtils.GetString(mo, "FirmwareVersion"),
                                SizeGB = BytesToGb(WmiUtils.GetDouble(mo, "Size")),
                                MediaType = MsftMediaTypeToString(WmiUtils.GetInt(mo, "MediaType")),
                                BusType = MsftBusTypeToString(WmiUtils.GetInt(mo, "BusType")),
                            });
                        }
                    }
                }

                return result.Count > 0 ? result : null;
            }
            catch (Exception ex)
            {
                FileLogger.Warn("MSFT_PhysicalDisk nedostupan (očekivano na Windows 7), koristim Win32_DiskDrive: " + ex.Message);
                return null;
            }
        }

        private static List<StorageInfo> CollectStorageViaDiskDrive()
        {
            var result = new List<StorageInfo>();

            foreach (var mo in QueryAll(
                "SELECT Model, SerialNumber, FirmwareRevision, Size, InterfaceType, DeviceID FROM Win32_DiskDrive"))
            {
                using (mo)
                {
                    result.Add(new StorageInfo
                    {
                        Model = WmiUtils.GetString(mo, "Model"),
                        Serial = WmiUtils.GetString(mo, "SerialNumber"),
                        Firmware = WmiUtils.GetString(mo, "FirmwareRevision"),
                        SizeGB = BytesToGb(WmiUtils.GetDouble(mo, "Size")),
                        MediaType = null,
                        BusType = WmiUtils.GetString(mo, "InterfaceType"),
                        DeviceId = WmiUtils.GetString(mo, "DeviceID"),
                    });
                }
            }

            return result;
        }

        private static double? BytesToGb(double? bytes)
        {
            return bytes.HasValue ? (double?)Math.Round(bytes.Value / 1024 / 1024 / 1024, 1) : null;
        }

        private static string FormFactorToString(int? code)
        {
            if (!code.HasValue) return null;
            switch (code.Value)
            {
                case 8: return "DIMM";
                case 12: return "SODIMM";
                case 13: return "SRIMM";
                default: return code.Value.ToString();
            }
        }

        private static string MsftMediaTypeToString(int? code)
        {
            if (!code.HasValue) return "Unspecified";
            switch (code.Value)
            {
                case 3: return "HDD";
                case 4: return "SSD";
                case 5: return "SCM";
                default: return "Unspecified";
            }
        }

        private static string MsftBusTypeToString(int? code)
        {
            if (!code.HasValue) return null;
            switch (code.Value)
            {
                case 7: return "USB";
                case 8: return "RAID";
                case 11: return "SATA";
                case 17: return "NVMe";
                default: return code.Value.ToString();
            }
        }

        private static ManagementObject QueryFirst(string wql)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher(wql))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        return mo;
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("WMI upit neuspešan (" + wql + "): " + ex.Message);
            }

            return null;
        }

        private static List<ManagementObject> QueryAll(string wql)
        {
            var results = new List<ManagementObject>();

            try
            {
                using (var searcher = new ManagementObjectSearcher(wql))
                {
                    foreach (ManagementObject mo in searcher.Get())
                    {
                        results.Add(mo);
                    }
                }
            }
            catch (ManagementException ex)
            {
                FileLogger.Warn("WMI upit neuspešan (" + wql + "): " + ex.Message);
            }

            return results;
        }
    }
}
