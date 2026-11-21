using System;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.DnsLogs
{
    /// <summary>
    /// P/Invoke layer over WinDivert.dll - the constants/signatures here are copied
    /// directly from the official WinDivert 2.2.2 documentation (include/windivert.h,
    /// doc/WinDivert.html), not from memory - the values FLAG_SNIFF (0x0001)/
    /// LAYER_NETWORK (0) and INVALID_HANDLE_VALUE (-1) on error from
    /// WinDivertOpen were verified live against that source.
    ///
    /// Why WinDivert and not Npcap: Npcap's silent (/S) install mode is
    /// available ONLY with the paid "Npcap OEM" edition (confirmed live against the
    /// npcap.com documentation - the free version has no silent install,
    /// the attempt caused a 10-minute job timeout on a real machine). WinDivert
    /// doesn't have that problem - the driver installs itself silently on the first
    /// WinDivertOpen() call, it's enough for the WinDivert.dll/WinDivert64.sys
    /// files to just SIT next to the .exe (no separate install step at all).
    /// The cost: WinDivert officially supports only Windows 10/11/Server (not
    /// Windows 7) - accepted, the Windows 7 fleet deliberately stays without DNS
    /// packet-capture visibility.
    /// </summary>
    internal static class WinDivertInterop
    {
        internal const int WINDIVERT_LAYER_NETWORK = 0;
        internal const ulong WINDIVERT_FLAG_SNIFF = 0x0001;

        // HANDLE is marshaled as IntPtr - INVALID_HANDLE_VALUE is (HANDLE)(-1),
        // not IntPtr.Zero (the Win32 convention, not the .NET null-handle convention).
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

        // Corresponds to WINDIVERT_ADDRESS from windivert.h: INT64 Timestamp (8B) +
        // bitfields packed into one UINT32 (8+8+1+1+1+1+1+1+1+1+8=32 bits,
        // not unpacked here - the filter string already guarantees that every
        // received packet is outbound/UDP/port 53, we don't need a post-hoc check)
        // + UINT32 Reserved2 (4B) + union WINDIVERT_DATA_* (max 64B). 80 bytes in
        // total - must match the native structure so that
        // WinDivertRecv writes into it correctly (we don't read the union contents at all).
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
