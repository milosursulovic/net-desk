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
    /// Monitors this machine's DNS queries via WinDivert (WinDivert.dll +
    /// WinDivert64.sys, both next to the .exe in the Service folder) - the second replacement for
    /// the earlier ETW Microsoft-Windows-DNS-Client version.
    ///
    /// The FIRST replacement was Npcap (tried live), but its silent (/S)
    /// install mode is available ONLY with the paid "Npcap OEM" edition -
    /// the free version of the installer, despite /S, behaved as if it were waiting for
    /// an interactive confirmation that Session 0 (where the service runs) can never
    /// give, so the 'install-npcap' preset job on a real machine hit the
    /// 10-minute JobExecutor timeout. WinDivert doesn't have that problem - the driver
    /// installs itself automatically and SILENTLY on the first WinDivertOpen() call, without
    /// any separate install step/preset.
    ///
    /// REASON FOR MIGRATING FROM ETW (the same as for the Npcap attempt): the ETW
    /// DNS-Client provider sees ONLY queries through the Windows OS resolver API.
    /// An application (or malware) that opens a UDP socket itself and sends a raw
    /// DNS query to port 53 - exactly the pattern of C2 beaconing/DNS tunneling,
    /// precisely what this feature is meant to catch - is invisible to ETW.
    /// WinDivert (like Npcap) sees every packet on the wire, regardless of the API
    /// that sent it.
    ///
    /// LIMITATION (deliberately accepted): WinDivert officially supports only
    /// Windows 10/11/Server, NOT Windows 7 - Windows 7 machines in the fleet are left
    /// without DNS packet-capture visibility for this feature (TryStart() just
    /// silently returns false, the rest of the agent works normally).
    ///
    /// Filter "outbound and udp and udp.DstPort == 53" + WINDIVERT_FLAG_SNIFF
    /// - the same design as the Npcap version: only OUTBOUND UDP queries of THIS machine
    /// (not DNS responses too - that would double the count), and SNIFF mode means a copy of
    /// the packet with no obligation/ability to accidentally modify/block anything
    /// on the network (WinDivert otherwise CAN modify/drop
    /// traffic - sniff mode deliberately disables that ability at the
    /// handle level, purely passive observation). TCP DNS and IPv6 are out of scope for v1
    /// (the same reason as the Npcap version - a rare case in practice, TCP would
    /// require stream reassembly).
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
                    // The most common expected cases live: 2 (ERROR_FILE_NOT_FOUND -
                    // WinDivert64.sys doesn't exist next to the .exe), 5 (ERROR_ACCESS_DENIED -
                    // not running as Administrator/LocalSystem), 1275
                    // (ERROR_DRIVER_BLOCKED - an IPS/EDR is blocking the driver, the same pattern of
                    // problem as the old "restart-service" IPS blocking).
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
                    // The same "survive an error per cycle" contract as the rest of the agent -
                    // it must not bring down the background thread permanently.
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
                    // WinDivertClose() (called from Dispose on another thread) makes the
                    // blocking WinDivertRecv return an error immediately - that's the normal
                    // shutdown path, not a real error, if _stopping is already true
                    // (checked above). If it is NOT a shutdown, log and keep trying.
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
                // Parsing an individual packet must not bring down the capture loop -
                // skip that one packet.
            }
        }

        /// <summary>
        /// WinDivert (unlike Npcap) delivers the packet FROM the IP layer
        /// upwards - there's no Ethernet/VLAN header to take care of.
        /// Only IPv4 in v1 (the same reason as the Npcap version - IPv6 DNS is rare
        /// in practice here, out of scope for now).
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
        /// Length-prefixed DNS labels (e.g. 3www6google3com0) - doesn't follow
        /// compression pointers (the 0xC0 bit) in the Question section, because there
        /// they legitimately almost never exist - if they do show up, simply
        /// stop (better a shorter/incomplete name than an infinite loop over a
        /// maliciously crafted packet).
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
        /// Atomically takes the currently accumulated state and clears it for the next
        /// window (drain-and-replace) - called periodically by AgentWorker
        /// (DnsLogIntervalSeconds), not by the capture thread.
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
                    // Closing the handle makes the blocking WinDivertRecv on the
                    // capture thread fail immediately with an error - CaptureLoop then sees
                    // _stopping=true and exits quietly, instead of hanging on WinDivertRecv,
                    // which otherwise blocks until the next packet arrives.
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
