using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>
    /// Administrative configuration (server, timing), loaded from config.json.
    /// Unlike AgentState, this file isn't written by the agent itself - the admin sets it
    /// before the service is first started.
    /// </summary>
    public class AgentSettings
    {
        public string ServerBaseUrl { get; set; }

        /// <summary>
        /// Used only for the one-time enroll call. After a successful enroll the
        /// agent permanently uses agentId+apiKey from AgentState and this field is no longer
        /// read - it can be removed from config.json after the first registration.
        /// </summary>
        public string EnrollToken { get; set; }

        public int HeartbeatIntervalSeconds { get; set; } = 30;
        public int InventoryIntervalSeconds { get; set; } = 3600;
        public int JobsPollIntervalSeconds { get; set; } = 15;
        public int EventLogIntervalSeconds { get; set; } = 300;
        public int DnsLogIntervalSeconds { get; set; } = 300;
        public int UpdateCheckIntervalSeconds { get; set; } = 1800;

        /// <summary>
        /// More frequent than the DNS/Event Log sync (300s) on purpose - the goal is to
        /// catch an ACTIVE remote-access session in progress, not to leave a
        /// historical trace that arrives too late.
        /// </summary>
        public int ProcessMonitorIntervalSeconds { get; set; } = 60;

        /// <summary>
        /// Watchlist for ProcessMonitor.ProcessWatchCollector - a substring,
        /// case-insensitive comparison against the name of the running process (without
        /// the ".exe" extension). The built-in default covers current and older
        /// TeamViewer executable names - the admin extends/changes it via the
        /// "Upiši key/value u config.json" (write key/value to config.json) preset script, without needing to
        /// rebuild/redeploy the agent.
        /// </summary>
        public List<string> WatchedProcessNames { get; set; } = new List<string>
        {
            "anydesk",
            "teamviewer",
            "tv_w32",
            "tvnserver",
        };

        /// <summary>
        /// Master switch for ACTIVELY killing processes from WatchedProcessNames
        /// (not just detection/logging) - deliberately FALSE by default. The watchlist
        /// above is filled with default values, so TRUE as the
        /// default would mean that rolling out a NEW agent version immediately, silently starts
        /// killing those processes across the whole fleet without any explicit
        /// opt-in step. The admin turns this on knowingly via the "Upiši key/value
        /// u config.json" (write key/value to config.json) preset script, preferably on a pilot machine first.
        /// </summary>
        public bool KillWatchedProcesses { get; set; } = false;

        /// <summary>
        /// The port the local UltraVNC server (installed next to the agent,
        /// bound only to 127.0.0.1) listens on. The default VNC port 5900 is NOT
        /// used as the default here because on managed machines it's already
        /// taken by an existing RealVNC server (an independent install, outside
        /// this system) - UltraVNC should be installed on a different port to
        /// avoid the conflict. See NetdeskAgent.Common.Vnc.VncBridge.
        /// </summary>
        public int VncLocalPort { get; set; } = 5901;

        /// <summary>
        /// How many seconds the user consent dialog (ConsentPrompt) waits for
        /// an answer before it's treated as a "timeout" and the screen capture
        /// is refused. Ban on unsolicited screen capture - the bridge
        /// never comes up without an explicit "Yes" within this time.
        /// </summary>
        public int VncConsentTimeoutSeconds { get; set; } = 60;

        public static AgentSettings Load(string path)
        {
            if (!File.Exists(path))
            {
                throw new FileNotFoundException(
                    "Config fajl nije pronađen. Kreiraj ga na osnovu config.example.json: " + path,
                    path);
            }

            var json = File.ReadAllText(path);
            var settings = JsonConvert.DeserializeObject<AgentSettings>(json) ?? new AgentSettings();

            if (string.IsNullOrWhiteSpace(settings.ServerBaseUrl))
            {
                throw new InvalidDataException("ServerBaseUrl mora biti podešen u config.json.");
            }

            return settings;
        }
    }
}
