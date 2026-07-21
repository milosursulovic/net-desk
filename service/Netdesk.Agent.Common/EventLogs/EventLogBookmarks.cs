using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.EventLogs
{
    /// <summary>
    /// Perzistira poslednji pročitani EventRecordID po log imenu (System/
    /// Application), tako da se isti unosi ne šalju ponovo na svaki ciklus.
    /// Backend takođe ima dedup zaštitu (INSERT IGNORE na composite unique
    /// key), ovo je prvenstveno da agent ne šalje nepotrebno velike batch-eve
    /// unosa koje je server već video.
    /// </summary>
    public class EventLogBookmarks
    {
        public Dictionary<string, long> LastRecordIds { get; set; } = new Dictionary<string, long>();

        public long GetLastRecordId(string logName)
        {
            long value;
            return LastRecordIds.TryGetValue(logName, out value) ? value : 0;
        }

        public void SetLastRecordId(string logName, long value)
        {
            LastRecordIds[logName] = value;
        }

        public static EventLogBookmarks Load(string path)
        {
            if (!File.Exists(path)) return new EventLogBookmarks();

            try
            {
                var json = File.ReadAllText(path);
                return JsonConvert.DeserializeObject<EventLogBookmarks>(json) ?? new EventLogBookmarks();
            }
            catch
            {
                return new EventLogBookmarks();
            }
        }

        public void Save(string path)
        {
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }

            File.WriteAllText(path, JsonConvert.SerializeObject(this, Formatting.Indented));
        }
    }
}
