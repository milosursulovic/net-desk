namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstvena verzija Manager-a (ne agentova) - sad je stvarno praćeno
    /// polje na serveru (managers.manager_version, prijavljeno na enroll-u i
    /// svakom heartbeat-u), pa bump-agent-version disciplina važi i ovde:
    /// bumpuj pri svakoj izmeni fajla pod Netdesk.Agent.Manager/.
    /// </summary>
    public static class ManagerVersionInfo
    {
        public const string Current = "1.0.0";
    }
}
