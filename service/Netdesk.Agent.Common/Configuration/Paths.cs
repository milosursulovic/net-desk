using System;
using System.IO;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>Standard paths for the config/state/log files, in %ProgramData%\NetdeskAgent.</summary>
    public static class Paths
    {
        public static readonly string DataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgent");

        public static string ConfigFile => Path.Combine(DataDir, "config.json");
        public static string StateFile => Path.Combine(DataDir, "state.json");
        public static string EventLogBookmarksFile => Path.Combine(DataDir, "eventlog-bookmarks.json");
        public static string LogFile => Path.Combine(DataDir, "logs", "agent.log");

        /// <summary>
        /// The "mailbox" file through which NetdeskAgent.Service.exe requests an action from
        /// NetdeskAgentManager (restart/stop/start itself, or install an
        /// update) - see NetdeskAgent.Common.Manager.ManagerCommandClient.
        /// One pending command at a time, not a queue.
        /// </summary>
        public static string ManagerCommandFile => Path.Combine(DataDir, "manager-command.json");

        /// <summary>
        /// A log file separate from LogFile - both services (NetdeskAgent and
        /// NetdeskAgentManager) run at the same time, FileLogger has no cross-process
        /// coordination, so they must not share the same file.
        /// </summary>
        public static string ManagerLogFile => Path.Combine(DataDir, "logs", "manager.log");
    }
}
