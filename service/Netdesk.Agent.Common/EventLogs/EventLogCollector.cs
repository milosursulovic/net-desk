using System;
using System.Collections.Generic;
using System.Diagnostics.Eventing.Reader;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.EventLogs
{
    /// <summary>
    /// Reads the System and Application event logs via EventLogReader (spec 11.9 -
    /// the Security log is optional per the specification and deliberately left out for now,
    /// it usually requires separately enabled auditing and carries more sensitive data).
    /// Only the Critical/Error/Warning levels - Information is too much noise for
    /// centralized collection. Incremental via EventLogBookmarks.
    /// </summary>
    public static class EventLogCollector
    {
        private static readonly string[] LogNames = { "System", "Application" };

        // Upper limit per log per cycle - if more has accumulated (e.g. after
        // a longer connection outage), it's sent in subsequent cycles instead of one
        // huge batch.
        private const int MaxEntriesPerLog = 200;

        public static List<EventLogItem> Collect(EventLogBookmarks bookmarks)
        {
            var result = new List<EventLogItem>();

            foreach (var logName in LogNames)
            {
                try
                {
                    result.AddRange(CollectFromLog(logName, bookmarks));
                }
                catch (Exception ex)
                {
                    FileLogger.Warn("Čitanje event log-a '" + logName + "' neuspešno: " + ex.Message);
                }
            }

            return result;
        }

        private static List<EventLogItem> CollectFromLog(string logName, EventLogBookmarks bookmarks)
        {
            var result = new List<EventLogItem>();
            var lastRecordId = bookmarks.GetLastRecordId(logName);
            var maxRecordIdSeen = lastRecordId;

            // Level: 1=Critical, 2=Error, 3=Warning (Windows Event Log konvencija).
            var query = string.Format(
                "*[System[(Level=1 or Level=2 or Level=3) and EventRecordID > {0}]]",
                lastRecordId);

            var elQuery = new EventLogQuery(logName, PathType.LogName, query) { ReverseDirection = false };

            using (var reader = new EventLogReader(elQuery))
            {
                EventRecord record;
                var count = 0;

                while (count < MaxEntriesPerLog && (record = reader.ReadEvent()) != null)
                {
                    using (record)
                    {
                        if (record.RecordId.HasValue && record.RecordId.Value > maxRecordIdSeen)
                        {
                            maxRecordIdSeen = record.RecordId.Value;
                        }

                        result.Add(new EventLogItem
                        {
                            LogName = logName,
                            Level = LevelToString(record.Level),
                            Source = record.ProviderName,
                            EventId = record.Id,
                            Message = SafeFormatDescription(record),
                            LoggedAt = record.TimeCreated.HasValue
                                ? record.TimeCreated.Value.ToUniversalTime().ToString("o")
                                : null,
                        });

                        count++;
                    }
                }
            }

            bookmarks.SetLastRecordId(logName, maxRecordIdSeen);
            return result;
        }

        private static string SafeFormatDescription(EventRecord record)
        {
            try
            {
                return record.FormatDescription();
            }
            catch
            {
                // FormatDescription can throw if the provider manifest isn't
                // available locally (e.g. a driver that's no longer installed) -
                // not critical, just skip the message.
                return null;
            }
        }

        private static string LevelToString(byte? level)
        {
            switch (level)
            {
                case 1: return "Critical";
                case 2: return "Error";
                case 3: return "Warning";
                case 4: return "Information";
                default: return "Unknown";
            }
        }
    }
}
