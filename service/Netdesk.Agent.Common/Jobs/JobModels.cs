using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace NetdeskAgent.Common.Jobs
{
    /// <summary>Jedna stavka iz GET /api/agents/jobs odgovora.</summary>
    public class JobItem
    {
        public long Id { get; set; }
        public long AgentId { get; set; }
        public string CommandType { get; set; }
        public JObject Payload { get; set; }
        public string Status { get; set; }
    }

    public class JobsResponse
    {
        public List<JobItem> Jobs { get; set; }
    }

    /// <summary>Telo POST /api/agents/jobs/:jobId/result zahteva.</summary>
    public class JobResultRequest
    {
        public int? ExitCode { get; set; }
        public string Output { get; set; }
        public string ErrorOutput { get; set; }
        public long? DurationMs { get; set; }
        public bool? Success { get; set; }
    }
}
