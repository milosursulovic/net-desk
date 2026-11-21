using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace NetdeskAgent.Common.EventLogs
{
    /// <summary>
    /// Persists the last read EventRecordID per log name (System/
    /// Application), so the same entries aren't sent again on every cycle.
    /// The backend also has dedup protection (INSERT IGNORE on a composite unique
    /// key), this is primarily so the agent doesn't send needlessly large batches of
    /// entries the server has already seen.
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
