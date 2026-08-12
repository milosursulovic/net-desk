using System;
using System.Runtime.InteropServices;
using System.Text;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// Sirov P/Invoke sloj nad wpcap.dll (Npcap/WinPcap C API) - NAMERNO bez
    /// SharpPcap/PacketDotNet NuGet paketa: proveren uživo da nijedna verzija
    /// SharpPcap-a (4.6.1 pa naviše) ne nosi net4x lib target, samo
    /// netstandard2.0 (zahteva net461+ potrošača) - ovaj projekat cilja
    /// net452 baš zbog Windows 7 flote (isti razlog kao TraceEvent 2.0.77 pin
    /// i WebSocketSharp-netstandard izbor ranije u ovom projektu). Direktan
    /// P/Invoke nad wpcap.dll radi identično na svakoj .NET Framework verziji
    /// - jedina "zavisnost" je da Npcap bude instaliran na ciljnoj mašini
    /// (vidi 'install-npcap' PowerShell preset).
    /// </summary>
    internal static class PcapInterop
    {
        internal const int PCAP_ERRBUF_SIZE = 256;
        internal const uint PCAP_IF_LOOPBACK = 0x1;

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal static extern int pcap_findalldevs(out IntPtr alldevs, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern void pcap_freealldevs(IntPtr alldevs);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal static extern IntPtr pcap_open_live(string device, int snaplen, int promisc, int to_ms, StringBuilder errbuf);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal static extern int pcap_compile(IntPtr p, out BpfProgram fp, string str, int optimize, uint netmask);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int pcap_setfilter(IntPtr p, ref BpfProgram fp);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern void pcap_freecode(ref BpfProgram fp);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int pcap_next_ex(IntPtr p, out IntPtr pkt_header, out IntPtr pkt_data);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern void pcap_close(IntPtr p);

        [DllImport("wpcap.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
        internal static extern IntPtr pcap_geterr(IntPtr p);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern bool SetDllDirectory(string lpPathName);

        internal static string PtrToErrBuf(StringBuilder errbuf)
        {
            return errbuf.ToString();
        }

        internal static string PtrToErrBuf(IntPtr errPtr)
        {
            return errPtr == IntPtr.Zero ? "(nepoznata greška)" : Marshal.PtrToStringAnsi(errPtr);
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct BpfProgram
        {
            public uint bf_len;
            public IntPtr bf_insns;
        }

        // pcap_if_t - povezana lista uređaja koju vraća pcap_findalldevs.
        [StructLayout(LayoutKind.Sequential)]
        internal struct PcapIf
        {
            public IntPtr Next;
            public IntPtr Name;
            public IntPtr Description;
            public IntPtr Addresses;
            public uint Flags;
        }
    }
}
