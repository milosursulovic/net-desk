using System.Collections.Generic;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Body of POST /api/agents/inventory. The field names are deliberately pinned
    /// explicitly via [JsonProperty] (we don't rely on automatic camelCase
    /// conversion for acronym fields like "NICs"/"RAMModules" - the backend
    /// accepts them in both PascalCase and camelCase variants via the pick() helper
    /// (metadata.service.js), but here we use exactly the first/PascalCase variant
    /// from the backend code so there's no ambiguity at all).
    /// </summary>
    public class InventoryRequest
    {
        [JsonProperty("ip")]
        public string Ip { get; set; }

        [JsonProperty("hostname")]
        public string Hostname { get; set; }

        [JsonProperty("department")]
        public string Department { get; set; }

        /// <summary>
        /// Whether the C:\Izvolte folder exists on this machine - a fixed, always identical
        /// path (doesn't depend on the system disk/install), a simple
        /// Directory.Exists check in InventoryCollector.Collect(). Nullable
        /// (not a plain bool) is DELIBERATE - the minimal syncs (event log/DNS/
        /// process detections in AgentWorker.cs) build an InventoryRequest
        /// directly without this field set, so a plain bool would always carry
        /// default(false) and falsely report "folder doesn't exist" on every such
        /// sync. null + RawJsonSettings.NullValueHandling.Ignore means the
        /// field is omitted from the JSON entirely when it wasn't actually checked -
        /// the backend then doesn't touch it (the same pattern as the OS/rdp_app merge).
        /// </summary>
        [JsonProperty("hasIzvolteFolder")]
        public bool? HasIzvolteFolder { get; set; }

        /// <summary>
        /// List of files (relative path + size) in its own Service
        /// install folder - the backend compares this against the manifest of the release
        /// matching the agentVersion this agent reports via
        /// heartbeat (checkServiceFilesMismatchService), to catch a
        /// broken/partial update. Null (not an empty list) on minimal
        /// syncs where it isn't collected - the same pattern as HasIzvolteFolder.
        /// </summary>
        [JsonProperty("serviceFiles")]
        public List<InstalledFileItem> ServiceFiles { get; set; }

        /// <summary>
        /// Whether the org-specific "CA_SSL_DECRIPT_BOR" root certificate
        /// (cert_CA_SSL_DECRIPT_BOR.crt, compared by Thumbprint against the
        /// reference file downloaded from /uploads/downloads/) is installed in the
        /// Local Machine "Trusted Root Certification Authorities" store.
        /// Nullable for the same reason as HasIzvolteFolder - null when the check
        /// couldn't run (e.g. the server was unreachable), not "definitely
        /// missing". See SecurityPostureCollector.cs.
        /// </summary>
        [JsonProperty("trustedRootCertInstalled")]
        public bool? TrustedRootCertInstalled { get; set; }

        /// <summary>
        /// Same as TrustedRootCertInstalled, just for the "SSL_TRUST" certificate
        /// (cert_SSL_TRUST.crt) in the Local Machine "Intermediate Certification
        /// Authorities" store.
        /// </summary>
        [JsonProperty("intermediateCertInstalled")]
        public bool? IntermediateCertInstalled { get; set; }

        /// <summary>
        /// Whether Secure DNS (DNS-over-HTTPS) is confirmed disabled via
        /// registry policy on ALL four browsers that the
        /// "Isključi Secure DNS" (disable Secure DNS) preset configures (Chrome/Edge/Brave/Firefox) -
        /// true only if ALL four checks confirmed the disabled state,
        /// otherwise false (not null - the registry read has no network dependency,
        /// it always gives a definite answer). See SecurityPostureCollector.cs.
        /// </summary>
        [JsonProperty("secureDnsDisabled")]
        public bool? SecureDnsDisabled { get; set; }

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

        [JsonProperty("dnsQueries")]
        public List<DnsQueryItem> DnsQueries { get; set; }

        [JsonProperty("processDetections")]
        public List<ProcessDetectionItem> ProcessDetections { get; set; }
    }

    /// <summary>Response of POST /api/agents/inventory - we don't need the metadata contents here, just the confirmation.</summary>
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

        [JsonProperty("Architecture")]
        public string Architecture { get; set; }
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

    /// <summary>
    /// One file in its own Service install folder - the relative
    /// path (forward-slash, the same separator as inside the release ZIP) and
    /// size in bytes. See InventoryCollector.CollectServiceFiles().
    /// </summary>
    public class InstalledFileItem
    {
        [JsonProperty("path")]
        public string Path { get; set; }

        [JsonProperty("sizeBytes")]
        public long SizeBytes { get; set; }
    }

    /// <summary>Corresponds to a syncComputerSoftware item in pdsu.service.js.</summary>
    public class SoftwareItem
    {
        public string DisplayName { get; set; }
        public string DisplayVersion { get; set; }
        public string Publisher { get; set; }
        public string InstallDate { get; set; }
    }

    /// <summary>Corresponds to a syncComputerDrivers item in pdsu.service.js.</summary>
    public class DriverItem
    {
        public string DeviceName { get; set; }
        public string DriverVersion { get; set; }
        public string DriverDate { get; set; }
        public string Manufacturer { get; set; }
        public string DriverProviderName { get; set; }
    }

    /// <summary>Corresponds to a syncComputerServices item in pdsu.service.js.</summary>
    public class ServiceItem
    {
        public string Name { get; set; }
        public string DisplayName { get; set; }
        public string State { get; set; }
        public string StartMode { get; set; }
        public string StartName { get; set; }
        public string PathName { get; set; }
    }

    /// <summary>Corresponds to a syncComputerUpdates item in pdsu.service.js (installed patches).</summary>
    public class InstalledUpdateItem
    {
        public string Description { get; set; }

        [JsonProperty("hotFixID")]
        public string HotFixId { get; set; }

        public string InstalledOn { get; set; }
        public string InstalledBy { get; set; }
    }

    /// <summary>Corresponds to a syncComputerPrinters item in pdsu.service.js.</summary>
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

    /// <summary>A Windows Event Log entry - computer_event_logs (append-only on the backend).</summary>
    public class EventLogItem
    {
        public string LogName { get; set; }
        public string Level { get; set; }
        public string Source { get; set; }
        public int? EventId { get; set; }
        public string Message { get; set; }
        public string LoggedAt { get; set; }
    }

    /// <summary>
    /// An aggregated DNS query (domain + first/last seen + query count in
    /// this sync window) - computer_dns_queries on the backend, upserted
    /// PER (computer, domain), not one row added per individual query.
    /// See DnsLogs.DnsQueryCollector.Snapshot().
    /// </summary>
    public class DnsQueryItem
    {
        public string Domain { get; set; }
        public string FirstSeen { get; set; }
        public string LastSeen { get; set; }
        public int Count { get; set; }
    }

    /// <summary>
    /// A hit from the watchlist of running processes (e.g. portable AnyDesk/
    /// TeamViewer) - computer_process_detections on the backend, upserted
    /// PER (computer, process name), the same pattern as DnsQueryItem. See
    /// ProcessMonitor.ProcessWatchCollector.Scan().
    /// </summary>
    public class ProcessDetectionItem
    {
        public string ProcessName { get; set; }
        public string FirstSeen { get; set; }
        public string LastSeen { get; set; }
        public int Count { get; set; }

        /// <summary>
        /// 1 if AT LEAST ONE instance of this process was successfully killed in this
        /// cycle (only when AgentSettings.KillWatchedProcesses is enabled),
        /// otherwise 0. Aggregated on the backend as kill_count, the same pattern
        /// as Count/detection_count.
        /// </summary>
        public int Killed { get; set; }
    }
}
