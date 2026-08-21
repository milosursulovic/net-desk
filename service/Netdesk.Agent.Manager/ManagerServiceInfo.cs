namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena kopija - MORA ostati identična sa agent-ovim
    /// Netdesk.Agent.Common.Manager.ManagerCommandClient.ManagerServiceName/
    /// CustomCommandCode (service/Netdesk.Agent.Common/Manager/ManagerCommandClient.cs),
    /// pošto Service tim konstantama zove ServiceController/ExecuteCommand
    /// PROTIV OVOG servisa po imenu/kodu - dogovor preko Windows SCM-a
    /// (naziv servisa + custom control code), ne deljena klasa.
    /// </summary>
    internal static class ManagerServiceInfo
    {
        public const string ServiceName = "NetdeskAgentManager";

        /// <summary>Custom service control code (mora biti u opsegu 128-255).</summary>
        public const int CustomCommandCode = 128;
    }
}
