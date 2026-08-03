using System.Collections.Generic;
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
        public int DnsLogIntervalSeconds { get; set; } = 300;
        public int UpdateCheckIntervalSeconds { get; set; } = 1800;

        /// <summary>
        /// Učestalije od DNS/Event Log sync-a (300s) namerno - cilj je
        /// uhvatiti AKTIVNU remote-access sesiju u toku, ne ostaviti
        /// istorijski trag koji stigne prekasno.
        /// </summary>
        public int ProcessMonitorIntervalSeconds { get; set; } = 60;

        /// <summary>
        /// Watchlist za ProcessMonitor.ProcessWatchCollector - substring,
        /// case-insensitive poređenje sa imenom pokrenutog procesa (bez
        /// ".exe" ekstenzije). Built-in default pokriva trenutne i starije
        /// TeamViewer izvršne nazive - admin dopunjuje/menja preko
        /// "Upiši key/value u config.json" preset skripte, bez potrebe za
        /// rebuild/redeploy agenta.
        /// </summary>
        public List<string> WatchedProcessNames { get; set; } = new List<string>
        {
            "anydesk",
            "teamviewer",
            "tv_w32",
            "tvnserver",
        };

        /// <summary>
        /// Master prekidač za AKTIVNO ubijanje procesa sa WatchedProcessNames
        /// (ne samo detekcija/log) - namerno podrazumevano FALSE. Watchlist
        /// gore je popunjena podrazumevanim vrednostima, pa bi TRUE kao
        /// default značio da rollout NOVE verzije agenta odmah, tiho počinje
        /// da ubija te procese na celoj floti bez ikakvog eksplicitnog
        /// opt-in koraka. Admin ovo svesno uključuje preko "Upiši key/value
        /// u config.json" preset skripte, po mogućstvu prvo na pilot mašini.
        /// </summary>
        public bool KillWatchedProcesses { get; set; } = false;

        /// <summary>
        /// Port na kom lokalni UltraVNC server (instaliran pored agenta,
        /// vezan samo na 127.0.0.1) sluša. Podrazumevani VNC port 5900 NIJE
        /// korišćen kao default ovde jer je na upravljanim mašinama već
        /// zauzet postojećim RealVNC serverom (nezavisna instalacija, van
        /// ovog sistema) - UltraVNC treba instalirati na drugom portu da
        /// izbegne konflikt. Videti NetdeskAgent.Common.Vnc.VncBridge.
        /// </summary>
        public int VncLocalPort { get; set; } = 5901;

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
