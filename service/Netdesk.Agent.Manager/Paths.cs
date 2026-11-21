using System;
using System.IO;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own minimal copy - only what the Manager actually uses
    /// (not the whole Netdesk.Agent.Common.Configuration.Paths). The values MUST
    /// stay identical to the agent's Paths.ManagerCommandFile/ManagerLogFile
    /// (service/Netdesk.Agent.Common/Configuration/Paths.cs) - that's an
    /// agreement via the file system (the mailbox path), not shared code. If it ever
    /// changes on the agent side, it must be aligned by hand here too.
    /// </summary>
    internal static class Paths
    {
        private static readonly string DataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgent");

        public static string ManagerCommandFile => Path.Combine(DataDir, "manager-command.json");

        public static string ManagerLogFile => Path.Combine(DataDir, "logs", "manager.log");

        // The Manager's OWN config/state for the new, independent HTTP channel -
        // DELIBERATELY in a separate ProgramData folder (NetdeskAgentManager, not
        // NetdeskAgent) so there's no confusion at all with the mailbox paths above
        // (which stay in the Agent's folder - that's a file-system contract,
        // not shared code, and must stay untouched).
        private static readonly string OwnDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgentManager");

        public static string ManagerConfigFile => Path.Combine(OwnDataDir, "config.json");

        public static string ManagerOwnStateFile => Path.Combine(OwnDataDir, "manager-state.json");

        public static string UpdateStagingDir => Path.Combine(OwnDataDir, "update-staging");
    }
}
