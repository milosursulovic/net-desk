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
    }
}
