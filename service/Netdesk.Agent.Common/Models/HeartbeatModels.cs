namespace NetdeskAgent.Common.Models
{
    /// <summary>Telo POST /api/agents/heartbeat zahteva.</summary>
    public class HeartbeatRequest
    {
        public string Hostname { get; set; }
        public string AgentVersion { get; set; }
        public int? UptimeSeconds { get; set; }
        public MonitoringData Monitoring { get; set; }
    }

    /// <summary>
    /// Odgovara MonitoringSchema na backend-u (dtos/agents.dto.js).
    /// AntivirusStatus/FirewallStatus ograničeni na "enabled" | "disabled" | "unknown"
    /// (dogovor iz backend memorije - alerting pravila se oslanjaju na tačno te vrednosti).
    /// </summary>
    public class MonitoringData
    {
        public double? CpuLoadPct { get; set; }
        public double? RamLoadPct { get; set; }
        public double? DiskUsedPct { get; set; }
        public double? DiskFreeGb { get; set; }
        public bool? NetworkConnected { get; set; }
        public string AntivirusStatus { get; set; }
        public string FirewallStatus { get; set; }
        public string BitlockerStatus { get; set; }
        public double? TemperatureC { get; set; }
    }

    public class HeartbeatResponse
    {
        public bool Ok { get; set; }
        public string ServerTime { get; set; }
        public HeartbeatAgentInfo Agent { get; set; }
    }

    public class HeartbeatAgentInfo
    {
        public string AgentId { get; set; }
        public string Status { get; set; }
        public string LastHeartbeatAt { get; set; }

        /// <summary>
        /// "Whitelist" postavljena od admina (agent detail stranica,
        /// PATCH /api/protected/agents/:id/process-kill-exempt) - kad je true,
        /// ProcessMonitor i dalje detektuje/loguje watched procese na ovoj
        /// mašini, ali ih NIKAD ne ubija (bez obzira na
        /// AgentSettings.KillWatchedProcesses). Videti AgentWorker.
        /// DoProcessMonitorAsync i AgentState.ProcessKillExempt.
        /// </summary>
        public bool ProcessKillExempt { get; set; }
    }

    /// <summary>Odgovor GET /api/agents/ping - test konekcije bez sporednih efekata.</summary>
    public class PingResponse
    {
        public bool Ok { get; set; }
        public string ServerTime { get; set; }
        public string AgentId { get; set; }
    }
}
