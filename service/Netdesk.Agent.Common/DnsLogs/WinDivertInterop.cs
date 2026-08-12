using System;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// P/Invoke sloj nad WinDivert.dll - konstante/potpisi ovde su prepisani
    /// direktno iz zvanične WinDivert 2.2.2 dokumentacije (include/windivert.h,
    /// doc/WinDivert.html), ne iz sećanja - vrednosti FLAG_SNIFF (0x0001)/
    /// LAYER_NETWORK (0) i INVALID_HANDLE_VALUE (-1) na grešci kod
    /// WinDivertOpen su uživo provereni protiv tog izvora.
    ///
    /// Zašto WinDivert a ne Npcap: Npcap-ov tihi (/S) instalacioni mod je
    /// dostupan SAMO uz plaćeno "Npcap OEM" izdanje (uživo potvrđeno protiv
    /// npcap.com dokumentacije - besplatna verzija nema tihu instalaciju,
    /// pokušaj je izazvao 10-minutni job timeout na pravoj mašini). WinDivert
    /// nema taj problem - drajver se sam, tiho instalira pri prvom
    /// WinDivertOpen() pozivu, dovoljno je da WinDivert.dll/WinDivert64.sys
    /// fajlovi samo SEDE pored .exe-a (nikakav poseban instalacioni korak).
    /// Cena: WinDivert zvanično podržava samo Windows 10/11/Server (ne
    /// Windows 7) - prihvaćeno, Windows 7 flota namerno ostaje bez DNS
    /// packet-capture vidljivosti.
    /// </summary>
    internal static class WinDivertInterop
    {
        internal const int WINDIVERT_LAYER_NETWORK = 0;
        internal const ulong WINDIVERT_FLAG_SNIFF = 0x0001;

        // HANDLE se marshaluje kao IntPtr - INVALID_HANDLE_VALUE je (HANDLE)(-1),
        // ne IntPtr.Zero (Win32 konvencija, ne .NET null-handle konvencija).
        internal static readonly IntPtr InvalidHandleValue = new IntPtr(-1);

        [DllImport("WinDivert.dll", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi, SetLastError = true)]
        internal static extern IntPtr WinDivertOpen(string filter, int layer, short priority, ulong flags);

        [DllImport("WinDivert.dll", CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
        internal static extern bool WinDivertRecv(
            IntPtr handle,
            byte[] pPacket,
            uint packetLen,
            out uint pRecvLen,
            ref WinDivertAddress pAddr);

        [DllImport("WinDivert.dll", CallingConvention = CallingConvention.Cdecl, SetLastError = true)]
        internal static extern bool WinDivertClose(IntPtr handle);

        // Odgovara WINDIVERT_ADDRESS iz windivert.h: INT64 Timestamp (8B) +
        // spakovana bitfield-ova u jedan UINT32 (8+8+1+1+1+1+1+1+1+1+8=32 bita,
        // ovde se ne raspakuje - filter string već garantuje da je svaki
        // primljen paket outbound/UDP/port 53, ne treba nam post-hoc provera)
        // + UINT32 Reserved2 (4B) + union WINDIVERT_DATA_* (max 64B). Ukupno
        // 80 bajtova - mora se poklopiti sa native strukturom da bi
        // WinDivertRecv ispravno pisao u nju (ne čitamo union sadržaj uopšte).
        [StructLayout(LayoutKind.Sequential)]
        internal struct WinDivertAddress
        {
            public long Timestamp;
            public uint PackedFlags;
            public uint Reserved2;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 64)]
            public byte[] Union;

            internal static WinDivertAddress Create()
            {
                return new WinDivertAddress { Union = new byte[64] };
            }
        }
    }
}
