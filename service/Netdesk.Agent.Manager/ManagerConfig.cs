using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Administrative configuration for the Manager's NEW, independent HTTP
    /// channel (enroll/heartbeat/job-poll) - its own file, separate from the Agent's
    /// (config.json in %ProgramData%\NetdeskAgent\), it lives in
    /// %ProgramData%\NetdeskAgentManager\ (see Paths.cs). The admin
    /// sets it before the first start (the same pattern as Common's
    /// AgentSettings.cs).
    /// </summary>
    public class ManagerConfig
    {
        public string ServerBaseUrl { get; set; }

        /// <summary>
        /// Used only for the one-time enroll call - after a successful
        /// enroll the Manager permanently uses ManagerId+ApiKey from
        /// ManagerState.cs, the same pattern as AgentSettings.EnrollToken.
        /// </summary>
        public string EnrollToken { get; set; }

        public int HeartbeatIntervalSeconds { get; set; } = 60;
        public int JobsPollIntervalSeconds { get; set; } = 30;

        public static ManagerConfig Load(string path)
        {
            if (!File.Exists(path))
            {
                throw new FileNotFoundException(
                    "Config fajl nije pronađen - Manager-ov nezavisni HTTP kanal se neće pokrenuti "
                    + "(mailbox put i dalje radi normalno): " + path,
                    path);
            }

            var json = File.ReadAllText(path);
            var config = JsonConvert.DeserializeObject<ManagerConfig>(json) ?? new ManagerConfig();

            if (string.IsNullOrWhiteSpace(config.ServerBaseUrl))
            {
                throw new InvalidDataException("ServerBaseUrl mora biti podešen u config.json.");
            }

            return config;
        }
    }
}
