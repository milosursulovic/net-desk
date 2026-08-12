using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;
using static NetdeskAgent.Common.DnsLogs.PcapInterop;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// Prati DNS upite ove mašine preko Npcap paketnog snimanja (wpcap.dll),
    /// zamena za raniju ETW Microsoft-Windows-DNS-Client verziju.
    ///
    /// RAZLOG MIGRACIJE (uživo otkriveno): ETW DNS-Client provajder vidi SAMO
    /// upite koji prođu kroz Windows-ov OS resolver API (DnsQuery/getaddrinfo).
    /// Aplikacija (ili malware) koja sama otvori UDP socket i pošalje sirov
    /// DNS upit na port 53 - baš tipičan obrazac za C2 beaconing/DNS
    /// tunneling, tačno ono što ovaj feature treba da uhvati - ETW-u je
    /// potpuno nevidljiva. Paketno snimanje vidi SVAKI paket na žici,
    /// nezavisno od toga koji API ga je napravio.
    ///
    /// PROMISC=0 NAMERNO - hvatamo samo saobraćaj OVE mašine (upitano ka DNS
    /// serveru), ne ceo segment mreže; monitor mode/promiskuitetno snimanje
    /// drugih računara je van obima i namene ovog feature-a (forenzika PO
    /// računaru, ne mrežni IDS). BPF filter "udp dst port 53" hvata samo
    /// ODLAZNE upite (ne i DNS ODGOVORE koji bi dupliralo brojanje istog
    /// upita), i samo UDP (v1 - TCP DNS zahteva reassembly stream-a, redak
    /// slučaj u praksi, van obima za sada).
    ///
    /// Zahteva Npcap instaliran na mašini (vidi 'install-npcap' PowerShell
    /// preset) - ako nije, TryStart() vraća false i DNS logging ostaje
    /// isključen ovog rada agenta (isti "best-effort, ne obori agenta"
    /// ugovor kao stara ETW verzija).
    /// </summary>
    public sealed class DnsQueryCollector : IDisposable
    {
        private const string BpfFilter = "ip and udp dst port 53";
        private const int SnapLen = 65536;
        private const int ReadTimeoutMs = 500;

        private readonly ConcurrentDictionary<string, DnsQueryAggregate> _aggregates =
            new ConcurrentDictionary<string, DnsQueryAggregate>();

        private readonly List<IntPtr> _handles = new List<IntPtr>();
        private readonly List<Task> _captureTasks = new List<Task>();
        private volatile bool _stopping;

        public bool TryStart()
        {
            try
            {
                // Npcap u "WinPcap API-compatible" modu instalira wpcap.dll/packet.dll
                // direktno u System32 (podrazumevani DLL search path); bez tog moda idu
                // u System32\Npcap\ podfolder, van default patha. Ovaj SetDllDirectory
                // pokriva OBA slučaja - ne zavisi striktno od tog moda, iako
                // 'install-npcap' preset ipak instalira SA njim (i zbog drugih alata
                // koji tu kompatibilnost mogu očekivati).
                var npcapDir = Environment.GetFolderPath(Environment.SpecialFolder.System) + "\\Npcap";
                SetDllDirectory(npcapDir);

                var devices = EnumerateCaptureDevices();
                if (devices.Count == 0)
                {
                    FileLogger.Warn("Npcap ne prijavljuje nijedan mrežni uređaj (instaliran je Npcap?) - DNS logging ostaje isključen ovog rada agenta.");
                    return false;
                }

                foreach (var device in devices)
                {
                    TryStartCaptureOnDevice(device);
                }

                if (_handles.Count == 0)
                {
                    FileLogger.Warn("Nijedan mrežni uređaj nije uspeo da otvori Npcap capture - DNS logging ostaje isključen ovog rada agenta.");
                    return false;
                }

                FileLogger.Info("Npcap DNS capture pokrenut na " + _handles.Count + " od " + devices.Count + " prijavljenih uređaja.");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("Npcap DNS capture nije moguće pokrenuti (da li je Npcap instaliran?) - DNS logging ostaje isključen ovog rada agenta.", ex);
                return false;
            }
        }

        /// <summary>
        /// pcap_findalldevs vraća povezanu listu - imena se odmah kopiraju u
        /// upravljane string-ove (lista se oslobađa pre povratka iz metode),
        /// loopback uređaji (PCAP_IF_LOOPBACK) se preskaču.
        /// </summary>
        private static List<string> EnumerateCaptureDevices()
        {
            var result = new List<string>();
            var errbuf = new StringBuilder(PCAP_ERRBUF_SIZE);

            if (pcap_findalldevs(out var allDevsPtr, errbuf) != 0)
            {
                throw new InvalidOperationException("pcap_findalldevs neuspešan: " + PtrToErrBuf(errbuf));
            }

            try
            {
                var current = allDevsPtr;
                while (current != IntPtr.Zero)
                {
                    var dev = Marshal.PtrToStructure<PcapIf>(current);
                    if ((dev.Flags & PCAP_IF_LOOPBACK) == 0 && dev.Name != IntPtr.Zero)
                    {
                        var name = Marshal.PtrToStringAnsi(dev.Name);
                        if (!string.IsNullOrEmpty(name))
                        {
                            result.Add(name);
                        }
                    }
                    current = dev.Next;
                }
            }
            finally
            {
                pcap_freealldevs(allDevsPtr);
            }

            return result;
        }

        private void TryStartCaptureOnDevice(string device)
        {
            var errbuf = new StringBuilder(PCAP_ERRBUF_SIZE);
            var handle = pcap_open_live(device, SnapLen, 0 /* promisc */, ReadTimeoutMs, errbuf);
            if (handle == IntPtr.Zero)
            {
                // Uobičajeno kad korisnik/servis nema prava na taj konkretan
                // uređaj (npr. virtuelni adapter) - ne fatalno, probaj ostale.
                FileLogger.Warn("Npcap: neuspešno otvaranje uređaja '" + device + "': " + PtrToErrBuf(errbuf));
                return;
            }

            if (pcap_compile(handle, out var program, BpfFilter, 1 /* optimize */, 0 /* netmask */) != 0)
            {
                FileLogger.Warn("Npcap: neuspešno kompajliranje BPF filtera na '" + device + "': " + PtrToErrBuf(pcap_geterr(handle)));
                pcap_close(handle);
                return;
            }

            var setFilterResult = pcap_setfilter(handle, ref program);
            pcap_freecode(ref program);
            if (setFilterResult != 0)
            {
                FileLogger.Warn("Npcap: neuspešna primena BPF filtera na '" + device + "': " + PtrToErrBuf(pcap_geterr(handle)));
                pcap_close(handle);
                return;
            }

            _handles.Add(handle);
            _captureTasks.Add(Task.Factory.StartNew(
                () => CaptureLoop(handle, device),
                CancellationToken.None,
                TaskCreationOptions.LongRunning,
                TaskScheduler.Default));
        }

        private void CaptureLoop(IntPtr handle, string device)
        {
            while (!_stopping)
            {
                int result;
                IntPtr pktHeader, pktData;
                try
                {
                    result = pcap_next_ex(handle, out pktHeader, out pktData);
                }
                catch (Exception ex)
                {
                    // Ne sme da obori pozadinsku nit trajno - pauza pa pokušaj dalje,
                    // isti "preživi grešku po ciklusu" ugovor kao AgentWorker petlja.
                    FileLogger.Error("Npcap capture greška na '" + device + "'", ex);
                    Thread.Sleep(ReadTimeoutMs);
                    continue;
                }

                if (result == 1)
                {
                    TryParsePacket(pktHeader, pktData);
                }
                else if (result == 0)
                {
                    // Timeout istekao, nema paketa - normalno, samo proveri _stopping.
                    continue;
                }
                else
                {
                    // -1 = greška na uređaju (npr. adapter isključen/uklonjen).
                    FileLogger.Warn("Npcap: pcap_next_ex vratio grešku na '" + device + "', zaustavljam snimanje na tom uređaju.");
                    break;
                }
            }
        }

        private void TryParsePacket(IntPtr pktHeaderPtr, IntPtr pktDataPtr)
        {
            try
            {
                // pcap_pkthdr: { timeval ts (8B: int tv_sec, int tv_usec); uint caplen; uint len; }
                var caplen = (int)(uint)Marshal.ReadInt32(pktHeaderPtr, 8);
                if (caplen <= 0 || caplen > SnapLen)
                {
                    return;
                }

                // Kopiranje u upravljan niz ODMAH - sav dalji rad je nad bezbednim,
                // granice-proverenim byte[]-om, nikad nad sirovim pokazivačem.
                var buffer = new byte[caplen];
                Marshal.Copy(pktDataPtr, buffer, 0, caplen);

                var domain = TryExtractQueryName(buffer);
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
                // Parsiranje pojedinačnog paketa ne sme da obori capture petlju -
                // preskoči taj jedan paket (isti ugovor kao stara ETW OnEvent metoda).
            }
        }

        /// <summary>
        /// Ethernet(+opciono VLAN tag) -> IPv4 -> UDP -> DNS pitanje. Vraća
        /// samo PRVO ime iz Question sekcije (isti "jedan QueryName" oblik
        /// kao stara ETW verzija) - dovoljno za praktičnu forenziku, više
        /// pitanja u jednom UDP DNS paketu je van RFC preporuke i retko u
        /// praksi.
        /// </summary>
        private static string TryExtractQueryName(byte[] buf)
        {
            if (buf.Length < 14)
            {
                return null;
            }

            var etherType = (ushort)((buf[12] << 8) | buf[13]);
            var offset = 14;

            // 802.1Q VLAN tag - stvarni EtherType je 4 bajta dalje.
            if (etherType == 0x8100)
            {
                if (buf.Length < 18)
                {
                    return null;
                }
                etherType = (ushort)((buf[16] << 8) | buf[17]);
                offset = 18;
            }

            if (etherType != 0x0800 /* IPv4 */)
            {
                return null;
            }

            if (buf.Length < offset + 20)
            {
                return null;
            }

            var ipHeaderLen = (buf[offset] & 0x0F) * 4;
            var protocol = buf[offset + 9];
            if (protocol != 17 /* UDP */ || buf.Length < offset + ipHeaderLen + 8)
            {
                return null;
            }

            var udpOffset = offset + ipHeaderLen;
            var dnsOffset = udpOffset + 8;
            if (buf.Length < dnsOffset + 12)
            {
                return null;
            }

            var qdCount = (buf[dnsOffset + 4] << 8) | buf[dnsOffset + 5];
            if (qdCount < 1)
            {
                return null;
            }

            return ReadDnsName(buf, dnsOffset + 12);
        }

        /// <summary>
        /// Dužinom-prefiksovane DNS labele (npr. 3www6google3com0) - ne
        /// prati compression pokazivače (0xC0 bit) u Question sekciji, jer
        /// tu legitimno gotovo nikad ne postoje (nema čemu ranijem da
        /// pokažu) - ako se ipak pojavi, prosto stani (bolje kraće/nepotpuno
        /// ime nego beskonačna petlja nad zlonamerno građenim paketom).
        /// </summary>
        private static string ReadDnsName(byte[] buf, int start)
        {
            var sb = new StringBuilder();
            var pos = start;

            while (pos < buf.Length)
            {
                var len = buf[pos];
                if (len == 0)
                {
                    break;
                }
                if ((len & 0xC0) == 0xC0)
                {
                    break;
                }

                pos++;
                if (pos + len > buf.Length)
                {
                    return null;
                }

                if (sb.Length > 0)
                {
                    sb.Append('.');
                }
                sb.Append(Encoding.ASCII.GetString(buf, pos, len));
                pos += len;
            }

            if (sb.Length == 0)
            {
                return null;
            }

            var domain = sb.ToString().Trim().TrimEnd('.').ToLowerInvariant();
            return domain.Length == 0 ? null : domain;
        }

        /// <summary>
        /// Atomski uzima trenutno nakupljeno stanje i prazni ga za sledeći
        /// prozor (drain-and-replace) - poziva AgentWorker periodično
        /// (DnsLogIntervalSeconds), ne capture niti.
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

        public void Dispose()
        {
            _stopping = true;

            try
            {
                // pcap_next_ex ima ReadTimeoutMs read-timeout, pa svaka capture
                // petlja primeti _stopping u tom prozoru - čekaj sve niti da se
                // vrate pre zatvaranja handle-ova ispod njih.
                Task.WaitAll(_captureTasks.ToArray(), TimeSpan.FromMilliseconds(ReadTimeoutMs * 4));
            }
            catch (Exception ex)
            {
                FileLogger.Error("Greška pri čekanju na zaustavljanje Npcap capture niti.", ex);
            }

            foreach (var handle in _handles)
            {
                try
                {
                    pcap_close(handle);
                }
                catch (Exception ex)
                {
                    FileLogger.Error("Greška pri zatvaranju Npcap capture uređaja.", ex);
                }
            }

            _handles.Clear();
        }

        private sealed class DnsQueryAggregate
        {
            public DateTime FirstSeen;
            public DateTime LastSeen;
            public int Count;
        }
    }
}
