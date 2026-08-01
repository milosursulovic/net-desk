using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Diagnostics.Tracing;
using Microsoft.Diagnostics.Tracing.Session;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// Prati DNS upite cele mašine preko ugrađenog Windows ETW
    /// "Microsoft-Windows-DNS-Client" provajdera - bez posebnog capture
    /// drajvera (za razliku od paketnog snimanja), radi in-process, i
    /// dostupan je od Windows Vista/Server 2008 naovamo (pokriva i
    /// Windows 7 mašine u floti, za razliku od svakog rešenja koje bi
    /// zahtevalo .NET 6+).
    ///
    /// Pokreće se JEDNOM pri startu servisa (ne po AgentWorker tick-u kao
    /// EventLogCollector) - ETW real-time sesija mora da radi kontinuirano
    /// da ne propusti upite između ciklusa. AgentWorker samo periodično
    /// zove Snapshot() da pokupi nakupljeno stanje za upload.
    ///
    /// Ne oslanja se na strogo tipizovanu DNS-Client event šemu (TraceEvent
    /// ne isporučuje ugrađenu tipizovanu klasu za ovaj provajder kao za
    /// kernel provajdere) - umesto toga generički čita "QueryName" polje iz
    /// SVAKOG dinamičkog event-a tog provajdera kod kog je prisutno, što je
    /// otporno na to koji tačno EventID (3006 upit poslat / 3008 upit
    /// završen - oba postoje u praksi) tačno nosi to polje.
    /// </summary>
    public sealed class DnsQueryCollector : IDisposable
    {
        private const string ProviderName = "Microsoft-Windows-DNS-Client";
        private const string SessionName = "NetdeskAgentDnsSession";

        private readonly ConcurrentDictionary<string, DnsQueryAggregate> _aggregates =
            new ConcurrentDictionary<string, DnsQueryAggregate>();

        private TraceEventSession _session;
        private Task _processingTask;

        /// <summary>
        /// Pokušava da pokrene ETW sesiju. Namerno guta grešku (npr. ako
        /// provider nije dostupan, ili sesija sa istim imenom već postoji od
        /// prethodnog neregularno ugašenog procesa) - DNS logging je
        /// sekundarna funkcija agenta, ne sme da obori heartbeat/inventory/
        /// jobs ako otkaže.
        /// </summary>
        public bool TryStart()
        {
            try
            {
                // Ako je prethodni proces agenta ugašen bez čistog exit-a (npr.
                // kill), stara sesija sa istim imenom može da ostane "zaglavljena"
                // u kernelu - eksplicitno je ugasi pre pokretanja nove.
                if (TraceEventSession.GetActiveSessionNames().Contains(SessionName))
                {
                    try
                    {
                        TraceEventSession.GetActiveSession(SessionName)?.Stop(true);
                    }
                    catch
                    {
                        // Best-effort čišćenje - ako ne uspe, EnableProvider ispod
                        // će jasno baciti grešku koju hvatamo dole.
                    }
                }

                _session = new TraceEventSession(SessionName, TraceEventSessionOptions.Create)
                {
                    StopOnDispose = true,
                };

                _session.EnableProvider(ProviderName);
                _session.Source.Dynamic.All += OnEvent;

                // TraceEventSession.Source.Process() blokira dozivajući nit dok se
                // sesija ne zaustavi - mora na sopstvenoj pozadinskoj niti, ne na
                // AgentWorker-ovoj tick petlji.
                _processingTask = Task.Factory.StartNew(
                    () => _session.Source.Process(),
                    CancellationToken.None,
                    TaskCreationOptions.LongRunning,
                    TaskScheduler.Default);

                FileLogger.Info("DNS query ETW sesija pokrenuta (" + ProviderName + ").");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("DNS query ETW sesiju nije moguće pokrenuti - DNS logging ostaje isključen ovog rada agenta.", ex);
                CleanupAfterFailedStart();
                return false;
            }
        }

        private void OnEvent(TraceEvent data)
        {
            try
            {
                object queryNameObj;
                try
                {
                    queryNameObj = data.PayloadByName("QueryName");
                }
                catch (ArgumentException)
                {
                    // Ovaj konkretan event (EventID) tog provajdera nema
                    // QueryName polje - očekivano za deo event tipova, samo
                    // preskoči.
                    return;
                }

                var domain = NormalizeDomain(queryNameObj as string);
                if (domain == null)
                {
                    return;
                }

                var now = DateTime.UtcNow;
                _aggregates.AddOrUpdate(
                    domain,
                    _ => new DnsQueryAggregate { FirstSeen = now, LastSeen = now, Count = 1 },
                    (_, existing) =>
                    {
                        existing.LastSeen = now;
                        existing.Count++;
                        return existing;
                    });
            }
            catch
            {
                // Parsiranje pojedinačnog event-a ne sme da obori ceo ETW
                // callback tok - preskoči taj jedan event.
            }
        }

        private static string NormalizeDomain(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                return null;
            }

            var domain = raw.Trim().TrimEnd('.').ToLowerInvariant();
            return domain.Length == 0 ? null : domain;
        }

        /// <summary>
        /// Atomski uzima trenutno nakupljeno stanje i prazni ga za sledeći
        /// prozor (drain-and-replace) - poziva AgentWorker periodično
        /// (DnsLogIntervalSeconds), ne ETW callback nit.
        /// </summary>
        public List<DnsQueryItem> Snapshot()
        {
            var keys = new List<string>(_aggregates.Keys);
            var result = new List<DnsQueryItem>(keys.Count);

            foreach (var domain in keys)
            {
                if (_aggregates.TryRemove(domain, out var agg))
                {
                    result.Add(new DnsQueryItem
                    {
                        Domain = domain,
                        FirstSeen = agg.FirstSeen.ToString("o"),
                        LastSeen = agg.LastSeen.ToString("o"),
                        Count = agg.Count,
                    });
                }
            }

            return result;
        }

        private void CleanupAfterFailedStart()
        {
            try
            {
                _session?.Dispose();
            }
            catch
            {
            }
            finally
            {
                _session = null;
            }
        }

        public void Dispose()
        {
            try
            {
                _session?.Dispose();
            }
            catch (Exception ex)
            {
                FileLogger.Error("Greška pri zatvaranju DNS query ETW sesije.", ex);
            }
        }

        private sealed class DnsQueryAggregate
        {
            public DateTime FirstSeen;
            public DateTime LastSeen;
            public int Count;
        }
    }
}
