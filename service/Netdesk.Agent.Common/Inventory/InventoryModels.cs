using System.Collections.Generic;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Telo POST /api/agents/inventory. Nazivi polja su namerno eksplicitno
    /// fiksirani preko [JsonProperty] (ne oslanjamo se na automatsku camelCase
    /// konverziju za akronimska polja poput "NICs"/"RAMModules" - backend ih
    /// prihvata i u PascalCase i camelCase varijanti preko pick() helper-a
    /// (metadata.service.js), ali ovde koristimo tačno prvu/PascalCase varijantu
    /// iz backend koda da nema nikakve dvosmislenosti).
    /// </summary>
    public class InventoryRequest
    {
        [JsonProperty("ip")]
        public string Ip { get; set; }

        [JsonProperty("hostname")]
        public string Hostname { get; set; }

        [JsonProperty("department")]
        public string Department { get; set; }

        [JsonProperty("OS")]
        public OsInfo Os { get; set; }

        [JsonProperty("System")]
        public SystemHardwareInfo System { get; set; }

        [JsonProperty("Motherboard")]
        public MotherboardInfo Motherboard { get; set; }

        [JsonProperty("BIOS")]
        public BiosInfo Bios { get; set; }

        [JsonProperty("CPU")]
        public CpuInfo Cpu { get; set; }

        [JsonProperty("RAMModules")]
        public List<RamModuleInfo> RamModules { get; set; }

        [JsonProperty("Storage")]
        public List<StorageInfo> Storage { get; set; }

        [JsonProperty("GPUs")]
        public List<GpuInfo> Gpus { get; set; }

        [JsonProperty("NICs")]
        public List<NicInfo> Nics { get; set; }

        [JsonProperty("WindowsUpdate")]
        public WindowsUpdateInfo WindowsUpdate { get; set; }

        [JsonProperty("software")]
        public List<SoftwareItem> Software { get; set; }

        [JsonProperty("drivers")]
        public List<DriverItem> Drivers { get; set; }

        [JsonProperty("services")]
        public List<ServiceItem> Services { get; set; }

        [JsonProperty("updates")]
        public List<InstalledUpdateItem> Updates { get; set; }

        [JsonProperty("printers")]
        public List<PrinterItem> Printers { get; set; }

        [JsonProperty("availableUpdates")]
        public List<AvailableUpdateItem> AvailableUpdates { get; set; }

        [JsonProperty("eventLogs")]
        public List<EventLogItem> EventLogs { get; set; }
    }

    /// <summary>Odgovor POST /api/agents/inventory - metadata sadržaj nam ovde ne treba, samo potvrda.</summary>
    public class InventoryResponse
    {
        [JsonProperty("ok")]
        public bool Ok { get; set; }

        [JsonProperty("ipEntryId")]
        public long? IpEntryId { get; set; }
    }

    public class OsInfo
    {
        [JsonProperty("Caption")]
        public string Caption { get; set; }

        [JsonProperty("Version")]
        public string Version { get; set; }

        [JsonProperty("Build")]
        public string Build { get; set; }

        [JsonProperty("InstallDate")]
        public string InstallDate { get; set; }
    }

    public class SystemHardwareInfo
    {
        [JsonProperty("Manufacturer")]
        public string Manufacturer { get; set; }

        [JsonProperty("Model")]
        public string Model { get; set; }

        [JsonProperty("TotalRAM_GB")]
        public double? TotalRamGb { get; set; }
    }

    public class MotherboardInfo
    {
        [JsonProperty("Manufacturer")]
        public string Manufacturer { get; set; }

        [JsonProperty("Product")]
        public string Product { get; set; }

        [JsonProperty("Serial")]
        public string Serial { get; set; }
    }

    public class BiosInfo
    {
        [JsonProperty("Vendor")]
        public string Vendor { get; set; }

        [JsonProperty("Version")]
        public string Version { get; set; }

        [JsonProperty("ReleaseDate")]
        public string ReleaseDate { get; set; }
    }

    public class CpuInfo
    {
        [JsonProperty("Name")]
        public string Name { get; set; }

        [JsonProperty("Cores")]
        public int? Cores { get; set; }

        [JsonProperty("LogicalCPUs")]
        public int? LogicalCpus { get; set; }

        [JsonProperty("MaxClockMHz")]
        public int? MaxClockMHz { get; set; }

        [JsonProperty("Socket")]
        public string Socket { get; set; }
    }

    public class RamModuleInfo
    {
        [JsonProperty("Slot")]
        public string Slot { get; set; }

        [JsonProperty("Manufacturer")]
        public string Manufacturer { get; set; }

        [JsonProperty("PartNumber")]
        public string PartNumber { get; set; }

        [JsonProperty("Serial")]
        public string Serial { get; set; }

        [JsonProperty("CapacityGB")]
        public double? CapacityGB { get; set; }

        [JsonProperty("SpeedMTps")]
        public int? SpeedMTps { get; set; }

        [JsonProperty("FormFactor")]
        public string FormFactor { get; set; }
    }

    public class StorageInfo
    {
        [JsonProperty("Model")]
        public string Model { get; set; }

        [JsonProperty("Serial")]
        public string Serial { get; set; }

        [JsonProperty("Firmware")]
        public string Firmware { get; set; }

        [JsonProperty("SizeGB")]
        public double? SizeGB { get; set; }

        [JsonProperty("MediaType")]
        public string MediaType { get; set; }

        [JsonProperty("BusType")]
        public string BusType { get; set; }

        [JsonProperty("DeviceID")]
        public string DeviceId { get; set; }
    }

    public class GpuInfo
    {
        [JsonProperty("Name")]
        public string Name { get; set; }

        [JsonProperty("DriverVers")]
        public string DriverVersion { get; set; }

        [JsonProperty("VRAM_GB")]
        public double? VramGB { get; set; }
    }

    public class NicInfo
    {
        [JsonProperty("Name")]
        public string Name { get; set; }

        [JsonProperty("MAC")]
        public string Mac { get; set; }

        [JsonProperty("SpeedMbps")]
        public long? SpeedMbps { get; set; }
    }

    public class WindowsUpdateInfo
    {
        [JsonProperty("ServiceStatus")]
        public string ServiceStatus { get; set; }

        [JsonProperty("LastCheckAt")]
        public string LastCheckAt { get; set; }
    }

    /// <summary>Odgovara syncComputerSoftware stavci u pdsu.service.js.</summary>
    public class SoftwareItem
    {
        public string DisplayName { get; set; }
        public string DisplayVersion { get; set; }
        public string Publisher { get; set; }
        public string InstallDate { get; set; }
    }

    /// <summary>Odgovara syncComputerDrivers stavci u pdsu.service.js.</summary>
    public class DriverItem
    {
        public string DeviceName { get; set; }
        public string DriverVersion { get; set; }
        public string DriverDate { get; set; }
        public string Manufacturer { get; set; }
        public string DriverProviderName { get; set; }
    }

    /// <summary>Odgovara syncComputerServices stavci u pdsu.service.js.</summary>
    public class ServiceItem
    {
        public string Name { get; set; }
        public string DisplayName { get; set; }
        public string State { get; set; }
        public string StartMode { get; set; }
        public string StartName { get; set; }
        public string PathName { get; set; }
    }

    /// <summary>Odgovara syncComputerUpdates stavci u pdsu.service.js (instalirane zakrpe).</summary>
    public class InstalledUpdateItem
    {
        public string Description { get; set; }

        [JsonProperty("hotFixID")]
        public string HotFixId { get; set; }

        public string InstalledOn { get; set; }
        public string InstalledBy { get; set; }
    }

    /// <summary>Odgovara syncComputerPrinters stavci u pdsu.service.js.</summary>
    public class PrinterItem
    {
        public string Name { get; set; }
        public string DriverName { get; set; }
        public string PortName { get; set; }
        public string Status { get; set; }
        public bool IsDefault { get; set; }
    }

    /// <summary>Dostupne (neinstalirane) zakrpe - computer_available_updates.</summary>
    public class AvailableUpdateItem
    {
        public string KbId { get; set; }
        public string Title { get; set; }
        public string Severity { get; set; }
    }

    /// <summary>Windows Event Log unos - computer_event_logs (append-only na backend-u).</summary>
    public class EventLogItem
    {
        public string LogName { get; set; }
        public string Level { get; set; }
        public string Source { get; set; }
        public int? EventId { get; set; }
        public string Message { get; set; }
        public string LoggedAt { get; set; }
    }
}
