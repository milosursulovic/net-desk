using System;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Spaja sve pojedinačne kolektore u jedan InventoryRequest za
    /// POST /api/agents/inventory. Svaki korak je best-effort - jedan
    /// neuspeli kolektor ne sme da sprovede ceo sync (svaki collector
    /// metod već sam po sebi guta sopstvene WMI/registry greške).
    ///
    /// includeAvailableUpdates je odvojen jer je COM pretraga za dostupnim
    /// zakrpama sporija - poziva se ređe (UpdateCheckIntervalSeconds), ne na
    /// svaki InventoryIntervalSeconds ciklus.
    /// </summary>
    public static class InventoryCollector
    {
        public static InventoryRequest Collect(string hostname, string department, bool includeAvailableUpdates)
        {
            var request = new InventoryRequest
            {
                Ip = HardwareCollector.GetPrimaryIPv4(),
                Hostname = hostname,
                Department = department,
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
