using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>
    /// The persisted agent identity (agentId + apiKey), obtained during enroll
    /// and saved to state.json so the agent doesn't re-register on every restart.
    /// The file lives in ProgramData, readable only by the LocalSystem/Administrators accounts
    /// per that folder's default NTFS ACL.
    /// </summary>
    public class AgentState
    {
        public string AgentId { get; set; }
        public string ApiKey { get; set; }

        [JsonIgnore]
        public bool IsEnrolled => !string.IsNullOrEmpty(AgentId) && !string.IsNullOrEmpty(ApiKey);

        /// <summary>
        /// Refreshed on EVERY successful heartbeat (the server-side "whitelist"
        /// setting for this agent) - deliberately [JsonIgnore], NOT persisted to
        /// state.json. Defaults to false after a service restart until the
        /// first successful heartbeat happens - negligible, because the heartbeat is first in
        /// the tick loop's priority and happens almost immediately at startup, long
        /// before the first ProcessMonitor cycle (ProcessMonitorIntervalSeconds).
        /// </summary>
        [JsonIgnore]
        public bool ProcessKillExempt { get; set; }

        public static AgentState Load(string path)
        {
            if (!File.Exists(path))
            {
                return new AgentState();
            }

            try
            {
                var json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<AgentState>(json) ?? new AgentState();
            }
            catch
            {
                // Damaged/incomplete state file - treat as an unregistered agent,
                // the next cycle will attempt a re-enroll.
                return new AgentState();
            }
        }

        public void Save(string path)
        {
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var json = JsonConvert.SerializeObject(this, Formatting.Indented);
            File.WriteAllText(path, json);
        }
    }
}
