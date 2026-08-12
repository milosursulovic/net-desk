using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Logging;
using static NetdeskAgent.Common.DnsLogs.WinDivertInterop;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// Prati DNS upite ove mašine preko WinDivert-a (WinDivert.dll +
    /// WinDivert64.sys, obe pored .exe-a u Service folderu) - druga zamena za
    /// raniju ETW Microsoft-Windows-DNS-Client verziju.
    ///
    /// PRVA zamena je bila Npcap (uživo isprobana), ali njen tihi (/S)
    /// instalacioni mod je dostupan SAMO uz plaćeno "Npcap OEM" izdanje -
    /// besplatna verzija instalera se, i pored /S, ponašala kao da čeka
    /// interaktivnu potvrdu koju Session 0 (gde servis radi) nikad ne može da
    /// da, pa je 'install-npcap' preset job na pravoj mašini pukao na
    /// 10-minutni JobExecutor timeout. WinDivert nema taj problem - drajver
    /// se automatski i TIHO instalira pri prvom WinDivertOpen() pozivu, bez
    /// ikakvog posebnog instalacionog koraka/preseta.
    ///
    /// RAZLOG MIGRACIJE OD ETW-a (isti kao i za Npcap pokušaj): ETW
    /// DNS-Client provajder vidi SAMO upite kroz Windows OS resolver API.
    /// Aplikacija (ili malware) koja sama otvori UDP socket i pošalje sirov
    /// DNS upit na port 53 - tačan obrazac za C2 beaconing/DNS tunneling,
    /// baš ono što ovaj feature treba da uhvati - ETW-u je nevidljiva.
    /// WinDivert (kao i Npcap) vidi svaki paket na žici, nezavisno od API-ja
    /// koji ga je poslao.
    ///
    /// OGRANIČENJE (namerno prihvaćeno): WinDivert zvanično podržava samo
    /// Windows 10/11/Server, NE Windows 7 - Windows 7 mašine u floti ostaju
    /// bez DNS packet-capture vidljivosti za ovaj feature (TryStart() samo
    /// tiho vrati false, ostatak agenta radi normalno).
    ///
    /// Filter "outbound and udp and udp.DstPort == 53" + WINDIVERT_FLAG_SNIFF
    /// - isti dizajn kao Npcap verzija: samo ODLAZNI UDP upiti OVE mašine
    /// (ne i DNS odgovori - dupliralo bi brojanje), i SNIFF mod znači kopija
    /// paketa bez ikakve obaveze/mogućnosti da se nešto pravo na mreži
    /// slučajno izmeni/blokira (WinDivert inače MOŽE da modifikuje/dropuje
    /// saobraćaj - sniff mod tu mogućnost namerno isključuje na nivou
    /// handle-a, čisto pasivno posmatranje). TCP DNS i IPv6 su van obima v1
    /// (isti razlog kao Npcap verzija - redak slučaj u praksi, TCP bi
    /// zahtevao stream reassembly).
    /// </summary>
    public sealed class DnsQueryCollector : IDisposable
    {
        private const string Filter = "outbound and udp and udp.DstPort == 53";
        private const int PacketBufferSize = 65536;

        private readonly ConcurrentDictionary<string, DnsQueryAggregate> _aggregates =
            new ConcurrentDictionary<string, DnsQueryAggregate>();

        private IntPtr _handle = InvalidHandleValue;
        private Task _captureTask;
        private volatile bool _stopping;

        public bool TryStart()
        {
            try
            {
                _handle = WinDivertOpen(Filter, WINDIVERT_LAYER_NETWORK, 0, WINDIVERT_FLAG_SNIFF);
                if (_handle == InvalidHandleValue)
                {
                    var errorCode = Marshal.GetLastWin32Error();
                    // Najčešći očekivani slučajevi uživo: 2 (ERROR_FILE_NOT_FOUND -
                    // WinDivert64.sys ne postoji pored .exe-a), 5 (ERROR_ACCESS_DENIED -
                    // ne radi kao Administrator/LocalSystem), 1275
                    // (ERROR_DRIVER_BLOCKED - IPS/EDR blokira drajver, isti obrazac
                    // problema kao stari "restart-service" IPS blokiranje).
                    FileLogger.Warn("WinDivertOpen neuspešan (Win32 greška " + errorCode + ") - DNS logging ostaje isključen ovog rada agenta.");
                    return false;
                }

                _captureTask = Task.Factory.StartNew(
                    CaptureLoop,
                    CancellationToken.None,
                    TaskCreationOptions.LongRunning,
                    TaskScheduler.Default);

                FileLogger.Info("WinDivert DNS capture pokrenut.");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("WinDivert DNS capture nije moguće pokrenuti (da li WinDivert.dll/WinDivert64.sys postoje pored .exe-a?) - DNS logging ostaje isključen ovog rada agenta.", ex);
                return false;
            }
        }

        private void CaptureLoop()
        {
            var buffer = new byte[PacketBufferSize];

            while (!_stopping)
            {
                var addr = WinDivertAddress.Create();
                bool ok;
                uint recvLen;
                try
                {
                    ok = WinDivertRecv(_handle, buffer, (uint)buffer.Length, out recvLen, ref addr);
                }
                catch (Exception ex)
                {
                    // Isti "preživi grešku po ciklusu" ugovor kao ostatak agenta -
                    // ne sme da obori pozadinsku nit trajno.
                    FileLogger.Error("WinDivert capture greška", ex);
                    Thread.Sleep(500);
                    continue;
                }

                if (_stopping)
                {
                    break;
                }

                if (!ok)
                {
                    // WinDivertClose() (pozvan iz Dispose na drugoj niti) čini da
                    // blokirajući WinDivertRecv odmah vrati grešku - to je normalan
                    // put gašenja, ne stvarna greška, ako je _stopping već true
                    // (provereno iznad). Ako NIJE gašenje, loguj i probaj dalje.
                    var errorCode = Marshal.GetLastWin32Error();
                    FileLogger.Warn("WinDivertRecv neuspešan (Win32 greška " + errorCode + ")");
                    continue;
                }

                TryParsePacket(buffer, recvLen);
            }
        }

        private void TryParsePacket(byte[] buf, uint length)
        {
            try
            {
                if (length < 20)
                {
                    return;
                }

                var domain = TryExtractQueryName(buf, (int)length);
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
                // preskoči taj jedan paket.
            }
        }

        /// <summary>
        /// WinDivert (za razliku od Npcap) isporučuje paket OD IP nivoa
        /// naviše - nema Ethernet/VLAN zaglavlja o kome treba voditi računa.
        /// Samo IPv4 u v1 (isti razlog kao Npcap verzija - IPv6 DNS je redak
        /// u praksi ovde, van obima za sada).
        /// </summary>
        private static string TryExtractQueryName(byte[] buf, int length)
        {
            var ipVersion = (buf[0] >> 4) & 0x0F;
            if (ipVersion != 4)
            {
                return null;
            }

            var ipHeaderLen = (buf[0] & 0x0F) * 4;
            var protocol = buf[9];
            if (protocol != 17 /* UDP */ || length < ipHeaderLen + 8)
            {
                return null;
            }

            var udpOffset = ipHeaderLen;
            var dnsOffset = udpOffset + 8;
            if (length < dnsOffset + 12)
            {
                return null;
            }

            var qdCount = (buf[dnsOffset + 4] << 8) | buf[dnsOffset + 5];
            if (qdCount < 1)
            {
                return null;
            }

            return ReadDnsName(buf, length, dnsOffset + 12);
        }

        /// <summary>
        /// Dužinom-prefiksovane DNS labele (npr. 3www6google3com0) - ne prati
        /// compression pokazivače (0xC0 bit) u Question sekciji, jer tu
        /// legitimno gotovo nikad ne postoje - ako se ipak pojave, prosto
        /// stani (bolje kraće/nepotpuno ime nego beskonačna petlja nad
        /// zlonamerno građenim paketom).
        /// </summary>
        private static string ReadDnsName(byte[] buf, int length, int start)
        {
            var sb = new StringBuilder();
            var pos = start;

            while (pos < length)
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
                if (pos + len > length)
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
                if (_handle != InvalidHandleValue)
                {
                    // Zatvaranje handle-a čini da blokirajući WinDivertRecv na
                    // capture niti odmah otkaže sa greškom - CaptureLoop tad vidi
                    // _stopping=true i mirno izađe, umesto da visi na WinDivertRecv
                    // koji inače blokira dok ne stigne sledeći paket.
                    WinDivertClose(_handle);
                    _handle = InvalidHandleValue;
                }

                _captureTask?.Wait(TimeSpan.FromSeconds(5));
            }
            catch (Exception ex)
            {
                FileLogger.Error("Greška pri zatvaranju WinDivert DNS capture handle-a.", ex);
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
