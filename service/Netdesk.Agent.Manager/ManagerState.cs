using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Perzistirani identitet Manager-a (managerId + apiKey), sopstven i
    /// NEZAVISAN od AgentState.cs (Common) - Manager se sad enrolluje na
    /// backend direktno, sopstvenim kredencijalima, ne pozajmljuje Agent-ove
    /// (videti napomenu na ManagerCommand.cs's AgentId/ApiKey polja - ta i
    /// dalje postoje, ali SAMO za mailbox/UpdateReportClient put; ovo je
    /// odvojen identitet za novi, nezavisni HTTP kanal).
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
                // Oštećen/nepotpun state fajl - tretiraj kao neregistrovanog
                // Manager-a, sledeći ciklus pokušava ponovni enroll.
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
