using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Administrativna konfiguracija za Manager-ov NOVI, nezavisni HTTP
    /// kanal (enroll/heartbeat/job-poll) - sopstven fajl, odvojen od Agent-a
    /// (config.json u %ProgramData%\NetdeskAgent\), živi u
    /// %ProgramData%\NetdeskAgentManager\ (videti Paths.cs). Admin ga
    /// postavlja pre prvog pokretanja (isti obrazac kao Common's
    /// AgentSettings.cs).
    /// </summary>
    public class ManagerConfig
    {
        public string ServerBaseUrl { get; set; }

        /// <summary>
        /// Koristi se samo za jednokratni enroll poziv - posle uspešnog
        /// enroll-a Manager trajno koristi ManagerId+ApiKey iz
        /// ManagerState.cs, isti obrazac kao AgentSettings.EnrollToken.
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
