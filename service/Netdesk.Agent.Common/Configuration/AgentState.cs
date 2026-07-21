using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.Configuration
{
    /// <summary>
    /// Perzistirani identitet agenta (agentId + apiKey), dobijen prilikom enroll-a
    /// i sačuvan u state.json da se agent ne registruje ponovo pri svakom restartu.
    /// Fajl živi u ProgramData, čitljiv samo pod LocalSystem/Administrators nalozima
    /// po default NTFS ACL-u tog foldera.
    /// </summary>
    public class AgentState
    {
        public string AgentId { get; set; }
        public string ApiKey { get; set; }

        [JsonIgnore]
        public bool IsEnrolled => !string.IsNullOrEmpty(AgentId) && !string.IsNullOrEmpty(ApiKey);

        public static AgentState Load(string path)
        {
            if (!File.Exists(path))
            {
                return new AgentState();
            }

            try
            {
                var json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<AgentState>(json) ?? new AgentState();
            }
            catch
            {
                // Oštećen/nepotpun state fajl - tretiraj kao neregistrovanog agenta,
                // sledeći ciklus će pokušati ponovni enroll.
                return new AgentState();
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
