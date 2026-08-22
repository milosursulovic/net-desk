using System;
using System.IO;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena, minimalna kopija - samo ono što Manager stvarno koristi
    /// (ne cela Netdesk.Agent.Common.Configuration.Paths). Vrednosti MORAJU
    /// ostati identične sa agent-ovim Paths.ManagerCommandFile/ManagerLogFile
    /// (service/Netdesk.Agent.Common/Configuration/Paths.cs) - to je
    /// dogovor preko fajl-sistema (mailbox putanja), ne deljen kod. Ako se
    /// jednog dana promeni na agent strani, mora se ručno uskladiti i ovde.
    /// </summary>
    internal static class Paths
    {
        private static readonly string DataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgent");

        public static string ManagerCommandFile => Path.Combine(DataDir, "manager-command.json");

        public static string ManagerLogFile => Path.Combine(DataDir, "logs", "manager.log");

        // Manager-ov SOPSTVENI config/state za novi, nezavisni HTTP kanal -
        // NAMERNO u odvojenom ProgramData folderu (NetdeskAgentManager, ne
        // NetdeskAgent) da ne bude ikakve zabune sa mailbox putanjama iznad
        // (koje ostaju u Agent-ovom folderu - to je fajl-sistemski ugovor,
        // ne deljen kod, i mora ostati netaknuto).
        private static readonly string OwnDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgentManager");

        public static string ManagerConfigFile => Path.Combine(OwnDataDir, "config.json");

        public static string ManagerOwnStateFile => Path.Combine(OwnDataDir, "manager-state.json");

        public static string UpdateStagingDir => Path.Combine(OwnDataDir, "update-staging");
    }
}
