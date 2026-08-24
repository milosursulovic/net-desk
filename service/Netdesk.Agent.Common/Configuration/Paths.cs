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

        /// <summary>
        /// ODVOJEN folder od DataDir (ne "NetdeskAgent" root) - DataDir je
        /// čitljiv samo pod LocalSystem/Administrators po default NTFS ACL-u
        /// (vidi AgentState.cs), a Netdesk.Agent.WebRtcBridge.exe sad radi
        /// kao genuinski ulogovani korisnik (Scheduled Task "at logon", ne
        /// SYSTEM/impersoniran token - vidi Webrtc/WebRtcBridgeCommand.cs
        /// napomenu zašto), pa mora da može da čita i BRIŠE mailbox fajl bez
        /// admin prava. Ovaj folder dobija eksplicitnu ACL dozvolu za
        /// "Authenticated Users" (EnsureAcl u WebRtcBridgeCommandClient),
        /// DataDir ostaje netaknut/zaštićen.
        /// </summary>
        public static readonly string WebRtcMailboxDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "NetdeskAgent", "webrtc-mailbox");

        /// <summary>
        /// "Mailbox" fajl kojim Netdesk.Agent.Service.exe naručuje pokretanje
        /// nove WebRTC sesije od već-pokrenutog (Scheduled Task "at logon")
        /// Netdesk.Agent.WebRtcBridge.exe helper procesa - vidi
        /// NetdeskAgent.Common.Webrtc.WebRtcBridgeCommandClient. Isti
        /// atomic-rename write/delete-before-execute obrazac kao
        /// ManagerCommandFile, samo u ODVOJENOM (šire-čitljivom) folderu.
        /// </summary>
        public static string WebRtcBridgeCommandFile => Path.Combine(WebRtcMailboxDir, "webrtc-bridge-command.json");
    }
}
