using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>
    /// Administrativna konfiguracija (server, tajming), učitana iz config.json.
    /// Za razliku od AgentState, ovaj fajl ne piše sam agent - admin ga postavlja
    /// pre prvog pokretanja servisa.
    /// </summary>
    public class AgentSettings
    {
        public string ServerBaseUrl { get; set; }

        /// <summary>
        /// Koristi se samo za jednokratni enroll poziv. Nakon uspešnog enroll-a
        /// agent trajno koristi agentId+apiKey iz AgentState i ovo polje se više
        /// ne čita - može se ukloniti iz config.json posle prve registracije.
        /// </summary>
        public string EnrollToken { get; set; }

        public int HeartbeatIntervalSeconds { get; set; } = 30;
        public int InventoryIntervalSeconds { get; set; } = 3600;
        public int JobsPollIntervalSeconds { get; set; } = 15;
        public int EventLogIntervalSeconds { get; set; } = 300;
        public int UpdateCheckIntervalSeconds { get; set; } = 1800;

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
