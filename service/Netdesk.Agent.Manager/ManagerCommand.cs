namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena kopija (ne referenca na Netdesk.Agent.Common.Manager.
    /// ManagerCommand) - polja MORAJU ostati u istom obliku/nazivima kao
    /// agent-ova verzija (service/Netdesk.Agent.Common/Manager/ManagerCommand.cs),
    /// pošto je ovo JSON ugovor preko mailbox fajla (manager-command.json),
    /// ne deljena klasa. Plain PascalCase (bez [JsonProperty]) i dalje
    /// namerno - ovo nikad ne prelazi HTTP granicu ka Node backend-u.
    /// </summary>
    public class ManagerCommand
    {
        public string CommandId { get; set; }
        public string IssuedAtUtc { get; set; }

        /// <summary>"control_service" ili "install_files".</summary>
        public string Action { get; set; }

        // --- control_service polja ---
        public string ServiceName { get; set; }

        /// <summary>"start", "stop" ili "restart".</summary>
        public string ServiceAction { get; set; }

        // --- install_files polja - proizvoljne putanje, ne hardkodovane na
        // bilo koji fiksni install layout. Namerno NEMA BackupDir/rollback -
        // stop → obriši InstallDir potpuno → kopiraj StagingDir → start (vidi
        // ManagerWorker.InstallFilesAsync). ServerBaseUrl/AgentId/ApiKey/
        // FromVersion/ToVersion su OPCIONI - ako ServerBaseUrl nije popunjen,
        // Manager ne pokušava da javi rezultat serveru. ---
        public string StagingDir { get; set; }
        public string InstallDir { get; set; }

        /// <summary>
        /// Nazivi procesa (bez .exe) za nasilno ubijanje PRE brisanja/
        /// kopiranja - Manager namerno ne zna ŠTA ili ZAŠTO, samo dobije
        /// listu imena da ubije (vidi Netdesk.Agent.Common/Manager/
        /// ManagerCommand.cs za pun kontekst zašto ovo uopšte postoji -
        /// WebRTC companion proces koji ume da drži zaključane fajlove
        /// mnogo duže od običnog driver-unload lag-a).
        /// </summary>
        public string[] KillProcessNames { get; set; }
        public string ServerBaseUrl { get; set; }
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
        public string FromVersion { get; set; }
        public string ToVersion { get; set; }
    }
}
