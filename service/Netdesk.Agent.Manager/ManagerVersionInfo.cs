namespace NetdeskAgent.Manager
{
    /// <summary>
    /// The Manager's own version (not the agent's) - it's now a really tracked
    /// field on the server (managers.manager_version, reported at enroll and
    /// on every heartbeat), so the bump-agent-version discipline applies here too:
    /// bump it on every change to a file under Netdesk.Agent.Manager/.
    /// </summary>
    public static class ManagerVersionInfo
    {
        public const string Current = "1.1.1";
    }
}
