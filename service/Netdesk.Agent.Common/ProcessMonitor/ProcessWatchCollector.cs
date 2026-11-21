using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.ProcessMonitor
{
    /// <summary>
    /// Periodically compares the currently running processes against the watchlist
    /// (by default portable remote-access tools like AnyDesk/TeamViewer -
    /// see AgentSettings.WatchedProcessNames) - deliberately a PLAIN periodic
    /// check (Process.GetProcesses()), NOT ETW process-start/stop tracing:
    /// process-start ETW requires a kernel-level session that is a singleton on the
    /// machine (risk of colliding with other tools) and is probably not available on
    /// Windows 7 (part of the fleet) in this form, while a plain check works identically
    /// on all Windows versions without any additional risk. In theory it
    /// can miss a process that runs for less than one cycle, which isn't a
    /// realistic scenario for a long-running remote-access session.
    ///
    /// Unlike DnsQueryCollector, there's no background thread/aggregation
    /// dictionary here - each Scan() call IS the whole job (one snapshot),
    /// and the aggregation of the detection count OVER TIME (how many times the process was
    /// found alive across all cycles) is done on the backend (ON DUPLICATE KEY
    /// UPDATE), the same as computer_dns_queries.
    /// </summary>
    public static class ProcessWatchCollector
    {
        /// <summary>
        /// killMatches=true kills EVERY instance (not just one per name) of every
        /// running process whose name matches the watchlist - containment requires
        /// shutting down all instances, not just the first one encountered (e.g. TeamViewer
        /// typically has both a tv_w32/tv_x64 GUI process and TeamViewer_Service.exe
        /// at the same time). The kill is best-effort per instance - an error on ONE
        /// instance (e.g. access denied) must not prevent the attempt on the others.
        /// </summary>
        public static List<ProcessDetectionItem> Scan(IEnumerable<string> watchedNames, bool killMatches = false)
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
            var killed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var process in Process.GetProcesses())
            {
                try
                {
                    // Process.ProcessName doesn't include the ".exe" extension - watchlist
                    // entries are also without the extension (e.g. "anydesk", "teamviewer").
                    var name = process.ProcessName;
                    if (!watchlist.Any(w => name.ToLowerInvariant().Contains(w)))
                    {
                        continue;
                    }

                    matched.Add(name);

                    if (killMatches)
                    {
                        try
                        {
                            process.Kill();
                            killed.Add(name);
                            FileLogger.Warn("Process monitor: ubijen sumnjiv proces \"" + name + "\" (PID " + process.Id + ").");
                        }
                        catch (Exception killEx)
                        {
                            FileLogger.Error("Process monitor: neuspešan pokušaj ubijanja procesa \"" + name + "\" (PID " + process.Id + ")", killEx);
                        }
                    }
                }
                catch
                {
                    // The process may have exited between enumeration and reading the name -
                    // skip that one process, it must not bring down the whole scan.
                }
                finally
                {
                    // Process holds a native handle - it must be Disposed, this is called
                    // continuously for the lifetime of the service.
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
                    Killed = killed.Contains(name) ? 1 : 0,
                })
                .ToList();
        }
    }
}
