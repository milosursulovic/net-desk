using System;
using System.IO;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>Standardne putanje za config/state/log fajlove, u %ProgramData%\NetdeskAgent.</summary>
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
        /// "Mailbox" fajl kojim NetdeskAgent.Service.exe naručuje akciju od
        /// NetdeskAgentManager-a (restart/stop/start sebe, ili instalacija
        /// update-a) - vidi NetdeskAgent.Common.Manager.ManagerCommandClient.
        /// Jedna pending komanda odjednom, ne red čekanja.
        /// </summary>
        public static string ManagerCommandFile => Path.Combine(DataDir, "manager-command.json");

        /// <summary>
        /// Odvojen log fajl od LogFile - oba servisa (NetdeskAgent i
        /// NetdeskAgentManager) rade istovremeno, FileLogger nema cross-process
        /// koordinaciju pa ne sme da dele isti fajl.
        /// </summary>
        public static string ManagerLogFile => Path.Combine(DataDir, "logs", "manager.log");
    }
}
