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
    }
}
