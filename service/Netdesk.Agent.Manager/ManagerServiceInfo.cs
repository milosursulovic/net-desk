namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Its own copy - MUST stay identical to the agent's
    /// Netdesk.Agent.Common.Manager.ManagerCommandClient.ManagerServiceName/
    /// CustomCommandCode (service/Netdesk.Agent.Common/Manager/ManagerCommandClient.cs),
    /// since the Service uses those constants to call ServiceController/ExecuteCommand
    /// AGAINST THIS service by name/code - an agreement through the Windows SCM
    /// (service name + custom control code), not a shared class.
    /// </summary>
    internal static class ManagerServiceInfo
    {
        public const string ServiceName = "NetdeskAgentManager";

        /// <summary>Custom service control code (must be in the 128-255 range).</summary>
        public const int CustomCommandCode = 128;
    }
}
