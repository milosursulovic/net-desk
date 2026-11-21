namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own copy (not a reference to Netdesk.Agent.Common.Manager.
    /// ManagerCommand) - the fields MUST keep the same shape/names as the
    /// agent's version (service/Netdesk.Agent.Common/Manager/ManagerCommand.cs),
    /// since this is a JSON contract via the mailbox file (manager-command.json),
    /// not a shared class. Plain PascalCase (no [JsonProperty]) is still
    /// deliberate - this never crosses the HTTP boundary to the Node backend.
    /// </summary>
    public class ManagerCommand
    {
        public string CommandId { get; set; }
        public string IssuedAtUtc { get; set; }

        /// <summary>"control_service" or "install_files".</summary>
        public string Action { get; set; }

        // --- control_service polja ---
        public string ServiceName { get; set; }

        /// <summary>"start", "stop" or "restart".</summary>
        public string ServiceAction { get; set; }

        // --- install_files fields - arbitrary paths, not hardcoded to
        // any fixed install layout. Deliberately NO BackupDir/rollback -
        // stop → delete InstallDir completely → copy StagingDir → start (see
        // ManagerWorker.InstallFilesAsync). ServerBaseUrl/AgentId/ApiKey/
        // FromVersion/ToVersion are OPTIONAL - if ServerBaseUrl isn't filled in,
        // the Manager doesn't try to report the result to the server. ---
        public string StagingDir { get; set; }
        public string InstallDir { get; set; }
        public string ServerBaseUrl { get; set; }
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
        public string FromVersion { get; set; }
        public string ToVersion { get; set; }
    }
}
