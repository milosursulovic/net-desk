namespace NetdeskAgent.Common.Manager
{
    /// <summary>
    /// A "mailbox" message from NetdeskAgent.Service.exe to the NetdeskAgentManager
    /// service - serialized as JSON into Paths.ManagerCommandFile. Plain
    /// PascalCase (no [JsonProperty]) is deliberate - this never crosses the HTTP
    /// boundary to the Node backend (which would expect camelCase), the same pattern as
    /// AgentState.cs.
    /// </summary>
    public class ManagerCommand
    {
        public string CommandId { get; set; }
        public string IssuedAtUtc { get; set; }

        /// <summary>"control_service" or "install_files".</summary>
        public string Action { get; set; }

        // --- control_service fields - ServiceName is NOT hardcoded to
        // "NetdeskAgent", it works for any service name the Manager is allowed
        // to control. ---
        public string ServiceName { get; set; }

        /// <summary>"start", "stop" or "restart".</summary>
        public string ServiceAction { get; set; }

        // --- install_files fields - StagingDir/InstallDir are arbitrary
        // paths (not hardcoded to the Service folder) - the same mechanism can
        // in the future install/update ANY component at ANY
        // path (e.g. a completely separate folder/service outside C:\Program
        // Files\NetdeskAgent\), not just the NetdeskAgent Service. Deliberately NO
        // BackupDir/rollback - stop → delete InstallDir completely → copy
        // StagingDir → start, without keeping the old version. Backup-then-rollback
        // was removed on purpose: the rollback itself (copying back) previously
        // FAILED for the same reason as the original install (a locked file),
        // leaving the machine in a confusing state ("both the update and the rollback
        // failed") - a simple "delete then install" doesn't have that second
        // point of failure. ServerBaseUrl/AgentId/ApiKey/FromVersion/ToVersion are
        // OPTIONAL - if ServerBaseUrl isn't filled in, the Manager doesn't try to
        // report the result to the server (see ManagerWorker.ReportResultIfConfiguredAsync).
        public string StagingDir { get; set; }
        public string InstallDir { get; set; }
        public string ServerBaseUrl { get; set; }
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
        public string FromVersion { get; set; }
        public string ToVersion { get; set; }
    }
}
