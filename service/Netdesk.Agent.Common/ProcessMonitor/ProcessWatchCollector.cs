using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using NetdeskAgent.Common.Inventory;

namespace NetdeskAgent.Common.ProcessMonitor
{
    /// <summary>
    /// Periodično poredi trenutno pokrenute procese sa watchlist-om
    /// (podrazumevano portable remote-access alati poput AnyDesk/TeamViewer -
    /// vidi AgentSettings.WatchedProcessNames) - namerno OBIČNA periodična
    /// provera (Process.GetProcesses()), NE ETW process-start/stop tracing:
    /// process-start ETW zahteva kernel-nivo sesiju koja je singleton na
    /// mašini (rizik sudara sa drugim alatima) i verovatno nije dostupna na
    /// Windows 7 (deo flote) u ovoj formi, dok obična provera radi identično
    /// na svim verzijama Windows-a bez ikakvog dodatnog rizika. Teorijski
    /// može propustiti proces koji radi kraće od jednog ciklusa, što nije
    /// realan scenario za dugotrajnu remote-access sesiju.
    ///
    /// Za razliku od DnsQueryCollector-a, nema pozadinske niti/agregacionog
    /// rečnika ovde - svaki poziv Scan() JESTE ceo posao (jedan snapshot),
    /// a agregacija broja detekcija KROZ VREME (koliko puta je proces
    /// zatečen živ preko svih ciklusa) radi se na backend-u (ON DUPLICATE KEY
    /// UPDATE), isto kao computer_dns_queries.
    /// </summary>
    public static class ProcessWatchCollector
    {
        public static List<ProcessDetectionItem> Scan(IEnumerable<string> watchedNames)
        {
            var watchlist = (watchedNames ?? Enumerable.Empty<string>())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n.Trim().ToLowerInvariant())
                .ToList();

            if (watchlist.Count == 0)
            {
                return new List<ProcessDetectionItem>();
            }

            var matched = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    // Process.ProcessName ne uključuje ".exe" ekstenziju - watchlist
                    // unosi su takođe bez ekstenzije (npr. "anydesk", "teamviewer").
                    var name = process.ProcessName;
                    if (watchlist.Any(w => name.ToLowerInvariant().Contains(w)))
                    {
                        matched.Add(name);
                    }
                }
                catch
                {
                    // Proces se mogao ugasiti između enumeracije i čitanja imena -
                    // preskoči taj jedan proces, ne sme da obori ceo sken.
                }
                finally
                {
                    // Process drži native handle - mora se Dispose-ovati, poziva se
                    // trajno tokom života servisa.
                    process.Dispose();
                }
            }

            if (matched.Count == 0)
            {
                return new List<ProcessDetectionItem>();
            }

            var nowIso = DateTime.UtcNow.ToString("o");
            return matched
                .Select(name => new ProcessDetectionItem
                {
                    ProcessName = name,
                    FirstSeen = nowIso,
                    LastSeen = nowIso,
                    Count = 1,
                })
                .ToList();
        }
    }
}
