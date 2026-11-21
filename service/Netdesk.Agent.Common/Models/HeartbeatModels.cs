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
    /// Corresponds to MonitoringSchema on the backend (dtos/agents.dto.js).
    /// AntivirusStatus/FirewallStatus limited to "enabled" | "disabled" | "unknown"
    /// (an agreement from the backend memory - the alerting rules rely on exactly those values).
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
        /// "Whitelist" set by the admin (agent detail page,
        /// PATCH /api/protected/agents/:id/process-kill-exempt) - when true,
        /// ProcessMonitor still detects/logs watched processes on this
        /// machine, but NEVER kills them (regardless of
        /// AgentSettings.KillWatchedProcesses). See AgentWorker.
        /// DoProcessMonitorAsync and AgentState.ProcessKillExempt.
        /// </summary>
        public bool ProcessKillExempt { get; set; }
    }

    /// <summary>Response of GET /api/agents/ping - a connection test with no side effects.</summary>
    public class PingResponse
    {
        public bool Ok { get; set; }
        public string ServerTime { get; set; }
        public string AgentId { get; set; }
    }
}
