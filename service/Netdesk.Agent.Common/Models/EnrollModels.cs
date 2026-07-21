namespace NetdeskAgent.Common.Models
{
    /// <summary>Telo POST /api/agents/enroll zahteva.</summary>
    public class EnrollRequest
    {
        public string Hostname { get; set; }
        public string OsCaption { get; set; }
        public string OsVersion { get; set; }
        public string OsBuild { get; set; }
        public string AgentVersion { get; set; }
    }

    public class EnrollResponse
    {
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
        public string EnrolledAt { get; set; }
    }
}
