using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// The persisted identity of the Manager (managerId + apiKey), its own and
    /// INDEPENDENT of AgentState.cs (Common) - the Manager now enrolls with the
    /// backend directly, with its own credentials, it doesn't borrow the Agent's
    /// (see the note on ManagerCommand.cs's AgentId/ApiKey fields - those still
    /// exist, but ONLY for the mailbox/UpdateReportClient path; this is a
    /// separate identity for the new, independent HTTP channel).
    /// </summary>
    public class ManagerState
    {
        public string ManagerId { get; set; }
        public string ApiKey { get; set; }

        [JsonIgnore]
        public bool IsEnrolled => !string.IsNullOrEmpty(ManagerId) && !string.IsNullOrEmpty(ApiKey);

        public static ManagerState Load(string path)
        {
            if (!File.Exists(path))
            {
                return new ManagerState();
            }

            try
            {
                var json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<ManagerState>(json) ?? new ManagerState();
            }
            catch
            {
                // Damaged/incomplete state file - treat as an unregistered
                // Manager, the next cycle attempts a re-enroll.
                return new ManagerState();
            }
        }

        public void Save(string path)
        {
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            var json = JsonConvert.SerializeObject(this, Formatting.Indented);
            File.WriteAllText(path, json);
        }
    }
}
