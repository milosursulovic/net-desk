namespace NetdeskAgent.Common.Manager
{
    /// <summary>
    /// "Mailbox" poruka od NetdeskAgent.Service.exe ka NetdeskAgentManager
    /// servisu - serijalizovana kao JSON u Paths.ManagerCommandFile. Plain
    /// PascalCase (bez [JsonProperty]) je namerno - ovo nikad ne prelazi HTTP
    /// granicu ka Node backend-u (koji bi tražio camelCase), isti obrazac kao
    /// AgentState.cs.
    /// </summary>
    public class ManagerCommand
    {
        public string CommandId { get; set; }
        public string IssuedAtUtc { get; set; }

        /// <summary>"control_service" ili "install_files".</summary>
        public string Action { get; set; }

        // --- control_service polja - ServiceName NIJE hardkodovan na
        // "NetdeskAgent", radi za bilo koji naziv servisa koji Manager sme
        // da kontroliše. ---
        public string ServiceName { get; set; }

        /// <summary>"start", "stop" ili "restart".</summary>
        public string ServiceAction { get; set; }

        // --- install_files polja - StagingDir/InstallDir su proizvoljne
        // putanje (ne hardkodovane na Service folder) - isti mehanizam može
        // u budućnosti da instalira/ažurira BILO KOJU komponentu na BILO
        // KOJOJ putanji (npr. potpuno odvojen folder/servis van C:\Program
        // Files\NetdeskAgent\), ne samo NetdeskAgent Service. Namerno NEMA
        // BackupDir/rollback - stop → obriši InstallDir potpuno → kopiraj
        // StagingDir → start, bez čuvanja stare verzije. Backup-pa-rollback
        // je uklonjen namerno: sam rollback (kopiranje unazad) je ranije
        // PAO na istom razlogu kao originalna instalacija (zaključan fajl),
        // ostavljajući mašinu u konfuznom stanju ("i update i rollback
        // neuspešni") - jednostavan "obriši pa instaliraj" nema tu drugu
        // tačku otkaza. ServerBaseUrl/AgentId/ApiKey/FromVersion/ToVersion su
        // OPCIONI - ako ServerBaseUrl nije popunjen, Manager ne pokušava da
        // javi rezultat serveru (videti ManagerWorker.ReportResultIfConfiguredAsync).
        public string StagingDir { get; set; }
        public string InstallDir { get; set; }
        public string ServerBaseUrl { get; set; }
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
        public string FromVersion { get; set; }
        public string ToVersion { get; set; }
    }
}
