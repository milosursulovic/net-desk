using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Combines all the individual collectors into one InventoryRequest for
    /// POST /api/agents/inventory. Every step is best-effort - one
    /// failed collector must not bring down the whole sync (every collector
    /// method already swallows its own WMI/registry errors).
    ///
    /// includeAvailableUpdates is separate because the COM search for available
    /// patches is slower - it's called less often (UpdateCheckIntervalSeconds), not on
    /// every InventoryIntervalSeconds cycle.
    /// </summary>
    public static class InventoryCollector
    {
        public static InventoryRequest Collect(string hostname, string department, bool includeAvailableUpdates, string serverBaseUrl)
        {
            var request = new InventoryRequest
            {
                Ip = HardwareCollector.GetPrimaryIPv4(),
                Hostname = hostname,
                Department = department,
                HasIzvolteFolder = SafeCollect(() => Directory.Exists(@"C:\Izvolte"), "Izvolte folder"),
                ServiceFiles = SafeCollect(CollectServiceFiles, "Service folder fajlovi"),
                TrustedRootCertInstalled = SafeCollect(() => SecurityPostureCollector.CheckTrustedRootCertInstalled(serverBaseUrl), "Trusted Root sertifikat"),
                IntermediateCertInstalled = SafeCollect(() => SecurityPostureCollector.CheckIntermediateCertInstalled(serverBaseUrl), "Intermediate sertifikat"),
                SecureDnsDisabled = SafeCollect(SecurityPostureCollector.CheckSecureDnsDisabled, "Secure DNS stanje"),
            };

            if (string.IsNullOrEmpty(request.Ip))
            {
                FileLogger.Warn("Nije pronađena primarna IPv4 adresa - inventory sync se preskače ovog ciklusa.");
                return null;
            }

            request.Os = SafeCollect(HardwareCollector.CollectOs, "OS");
            request.System = SafeCollect(HardwareCollector.CollectSystem, "System");
            request.Motherboard = SafeCollect(HardwareCollector.CollectMotherboard, "Motherboard");
            request.Bios = SafeCollect(HardwareCollector.CollectBios, "BIOS");
            request.Cpu = SafeCollect(HardwareCollector.CollectCpu, "CPU");
            request.RamModules = SafeCollect(HardwareCollector.CollectRamModules, "RAM moduli");
            request.Storage = SafeCollect(HardwareCollector.CollectStorage, "Storage");
            request.Gpus = SafeCollect(HardwareCollector.CollectGpus, "GPU");
            request.Nics = SafeCollect(HardwareCollector.CollectNics, "NIC");
            request.Printers = SafeCollect(HardwareCollector.CollectPrinters, "Štampači");

            request.Software = SafeCollect(SoftwareCollector.Collect, "Softver");
            request.Drivers = SafeCollect(DriverCollector.Collect, "Drajveri");
            request.Services = SafeCollect(ServiceCollector.Collect, "Servisi");
            request.Updates = SafeCollect(WindowsUpdateCollector.CollectInstalled, "Instalirane zakrpe");
            request.WindowsUpdate = SafeCollect(WindowsUpdateCollector.CollectServiceInfo, "WU status");

            if (includeAvailableUpdates)
            {
                request.AvailableUpdates = SafeCollect(WindowsUpdateCollector.CollectAvailable, "Dostupne zakrpe");
            }

            return request;
        }

        /// <summary>
        /// Lists its own Service install folder (the same directory
        /// where this .exe lives, via Assembly.GetExecutingAssembly().Location -
        /// the same technique as UpdateManager.ResolveUpdaterExePath) - relative
        /// path + size per file, recursively (includes the amd64\/x86\
        /// subfolders). The backend compares this against the release manifest.
        /// </summary>
        private static List<InstalledFileItem> CollectServiceFiles()
        {
            var installDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (string.IsNullOrEmpty(installDir) || !Directory.Exists(installDir))
            {
                return null;
            }

            var result = new List<InstalledFileItem>();
            foreach (var filePath in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
            {
                var relativePath = filePath.Substring(installDir.Length)
                    .TrimStart('\\', '/')
                    .Replace('\\', '/');

                result.Add(new InstalledFileItem
                {
                    Path = relativePath,
                    SizeBytes = new FileInfo(filePath).Length,
                });
            }

            return result;
        }

        private static T SafeCollect<T>(Func<T> collect, string label)
        {
            try
            {
                return collect();
            }
            catch (Exception ex)
            {
                FileLogger.Error("Prikupljanje inventara neuspešno (" + label + ")", ex);
                return default(T);
            }
        }
    }
}
