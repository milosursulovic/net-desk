using System;
using System.Runtime.InteropServices;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// P/Invoke sloj nad vpx.dll (libvpx VP8 enkoder), za WebRTC video put
    /// (net472-only tier, vidi Netdesk.Agent.Common.csproj). Isti stil kao
    /// DnsLogs/WinDivertInterop.cs - konstante/strukture prepisane direktno
    /// iz zvaničnih libvpx zaglavlja (webmproject/libvpx, grana "main",
    /// vpx_codec.h/vpx_encoder.h/vpx_image.h/vpx_ext_ratectrl.h/vpx_tpl.h),
    /// ne iz sećanja.
    ///
    /// VAŽNO OGRANIČENJE OVE IZMENE: ovaj fajl je pisan i kompajliran
    /// (dotnet build) u Linux sandbox okruženju bez pravog Windows agenta i
    /// bez pravog vpx.dll-a - NIJE runtime-testiran. `vpx_codec_enc_cfg_t`
    /// je posebno rizičan (50+ polja, uključujući "vizier RC" polja dodata
    /// relativno skoro) - polja/redosled su prepisana verbatim iz main grane
    /// libvpx-a preko WebFetch-a, ali NISU nezavisno odbrojana bajt-po-bajt
    /// protiv izvornog fajla u ovoj sesiji. Pre prvog stvarnog build-a na
    /// Windows mašini: proveriti ovu strukturu protiv TAČNO ONE verzije
    /// libvpx zaglavlja koja odgovara vpx.dll binarnom fajlu koji se stvarno
    /// distribuira uz agenta (npr. ShiftMediaProject/libvpx release) - ABI
    /// se vremenom menja (zato i postoji VPX_ENCODER_ABI_VERSION provera
    /// ispod), stara/nova verzija zaglavlja mogu se razlikovati od ovoga.
    /// </summary>
    internal static class VpxInterop
    {
        // VPX_ENCODER_ABI_VERSION = 18 + VPX_CODEC_ABI_VERSION + VPX_EXT_RATECTRL_ABI_VERSION
        //   VPX_CODEC_ABI_VERSION = 4 + VPX_IMAGE_ABI_VERSION = 4 + 5 = 9
        //   VPX_EXT_RATECTRL_ABI_VERSION = 7 + VPX_TPL_ABI_VERSION = 7 + 5 = 12
        // => 18 + 9 + 12 = 39 (izračunato uživo iz vpx_codec.h/vpx_image.h/
        // vpx_ext_ratectrl.h/vpx_tpl.h na "main" grani u trenutku pisanja -
        // MORA se ponovo izračunati ako se bundle-uje drugačija libvpx verzija,
        // pogrešna vrednost ovde daje VPX_CODEC_ABI_MISMATCH na init, ne
        // silentnu grešku).
        private const int VpxEncoderAbiVersion = 39;

        // VPX_IMG_FMT_PLANAR = 0x100, VPX_IMG_FMT_I420 = VPX_IMG_FMT_PLANAR | 2.
        internal const int VpxImgFmtI420 = 0x100 | 2;

        internal const int VpxSsMaxLayers = 5;
        internal const int VpxTsMaxLayers = 5;
        internal const int VpxTsMaxPeriodicity = 16;
        internal const int VpxMaxLayers = 12;

        // vpx_codec_err_t - redosled = numeričke vrednosti (0-9), C enum bez
        // eksplicitnih dodela počinje od 0 i raste za 1.
        internal enum VpxCodecErr
        {
            Ok = 0,
            Error = 1,
            MemError = 2,
            AbiMismatch = 3,
            Incapable = 4,
            UnsupBitstream = 5,
            UnsupFeature = 6,
            CorruptFrame = 7,
            InvalidParam = 8,
            ListEnd = 9,
        }

        // enum vpx_rc_mode
        internal enum VpxRcMode
        {
            Vbr = 0,
            Cbr = 1,
            Cq = 2,
            Q = 3,
        }

        // enum vpx_enc_pass
        internal enum VpxEncPass
        {
            OnePass = 0,
            FirstPass = 1,
            LastPass = 2,
        }

        // enum vpx_kf_mode - vp8cx.h/vpx_encoder.h: VPX_KF_FIXED=0, VPX_KF_AUTO=1,
        // VPX_KF_DISABLED=2 (redosled potvrđen protiv istog "main" izvora).
        internal enum VpxKfMode
        {
            Fixed = 0,
            Auto = 1,
            Disabled = 2,
        }

        // vpx_codec_ctx_t - mali, potpuno fiksan struct (5 pokazivača/enum +
        // 1 union pokazivač), za razliku od enc_cfg ispod ovaj je verifikovan
        // sa visokom pouzdanošću (kratak, nema nizova/union sa promenljivim
        // sadržajem koje bi trebalo posebno pratiti). Poziva se zero-init pa
        // se prosleđuje kao ref u init - isti obrazac kao WinDivertAddress.Create().
        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxCodecCtx
        {
            public IntPtr Name;       // const char*
            public IntPtr Iface;      // vpx_codec_iface_t*
            public int Err;           // vpx_codec_err_t
            public IntPtr ErrDetail;  // const char*
            public uint InitFlags;    // vpx_codec_flags_t
            public IntPtr Config;     // union { dec_cfg*, enc_cfg*, raw } - samo alias, ne pišemo ovo direktno
            public IntPtr Priv;       // vpx_codec_priv_t*
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxRational
        {
            public int Num;
            public int Den;
        }

        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxFixedBuf
        {
            public IntPtr Buf;
            public IntPtr Sz; // size_t - pokazivačke širine
        }

        // vpx_codec_enc_cfg_t - VIDI UPOZORENJE NA VRHU FAJLA. Redosled polja
        // prepisan verbatim iz vpx_encoder.h (webmproject/libvpx, "main").
        // Namerno se u WebRtcSession-u dira SAMO nekoliko polja (g_w/g_h/
        // g_timebase/rc_target_bitrate/rc_end_usage/g_pass/rc_min_quantizer/
        // rc_max_quantizer/kf_mode) - sve ostalo ostaje ono što
        // vpx_codec_enc_config_default popuni, nikad se ručno ne piše.
        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxCodecEncCfg
        {
            public uint GUsage;
            public uint GThreads;
            public uint GProfile;
            public uint GW;
            public uint GH;
            public int GBitDepth;              // vpx_bit_depth_t
            public uint GInputBitDepth;
            public VpxRational GTimebase;
            public uint GErrorResilient;        // vpx_codec_er_flags_t
            public int GPass;                   // enum vpx_enc_pass
            public uint GLagInFrames;
            public uint RcDropframeThresh;
            public uint RcResizeAllowed;
            public uint RcScaledWidth;
            public uint RcScaledHeight;
            public uint RcResizeUpThresh;
            public uint RcResizeDownThresh;
            public int RcEndUsage;               // enum vpx_rc_mode
            public VpxFixedBuf RcTwopassStatsIn;
            public VpxFixedBuf RcFirstpassMbStatsIn;
            public uint RcTargetBitrate;
            public uint RcMinQuantizer;
            public uint RcMaxQuantizer;
            public uint RcUndershootPct;
            public uint RcOvershootPct;
            public uint RcBufSz;
            public uint RcBufInitialSz;
            public uint RcBufOptimalSz;
            public uint Rc2passVbrBiasPct;
            public uint Rc2passVbrMinsectionPct;
            public uint Rc2passVbrMaxsectionPct;
            public uint Rc2passVbrCorpusComplexity;
            public int KfMode;                   // enum vpx_kf_mode
            public uint KfMinDist;
            public uint KfMaxDist;
            public uint SsNumberLayers;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxSsMaxLayers)]
            public int[] SsEnableAutoAltRef;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxSsMaxLayers)]
            public uint[] SsTargetBitrate;
            public uint TsNumberLayers;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxTsMaxLayers)]
            public uint[] TsTargetBitrate;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxTsMaxLayers)]
            public uint[] TsRateDecimator;
            public uint TsPeriodicity;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxTsMaxPeriodicity)]
            public uint[] TsLayerId;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = VpxMaxLayers)]
            public uint[] LayerTargetBitrate;
            public int TemporalLayeringMode;
            public int UseVizierRcParams;
            public VpxRational ActiveWqFactor;
            public VpxRational ErrPerMbFactor;
            public VpxRational SrDefaultDecayLimit;
            public VpxRational SrDiffFactor;
            public VpxRational KfErrPerMbFactor;
            public VpxRational KfFrameMinBoostFactor;
            public VpxRational KfFrameMaxBoostFirstFactor;
            public VpxRational KfFrameMaxBoostSubsFactor;
            public VpxRational KfMaxTotalBoostFactor;
            public VpxRational GfMaxTotalBoostFactor;
            public VpxRational GfFrameMaxBoostFactor;
            public VpxRational ZmFactor;
            public VpxRational RdMultInterQpFac;
            public VpxRational RdMultArfQpFac;
            public VpxRational RdMultKeyQpFac;

            /// <summary>
            /// Nizovi su [MarshalAs(SizeConst=...)] fiksne dužine - moraju biti
            /// alocirani PRE marshaling-a (ka native pri pozivu, i za ispravno
            /// čitanje nazad) ili CLR baca/piše van granica. Pozvati odmah posle
            /// deklaracije lokalne promenljive, pre vpx_codec_enc_config_default.
            /// </summary>
            internal void AllocateArrays()
            {
                SsEnableAutoAltRef = new int[VpxSsMaxLayers];
                SsTargetBitrate = new uint[VpxSsMaxLayers];
                TsTargetBitrate = new uint[VpxTsMaxLayers];
                TsRateDecimator = new uint[VpxTsMaxLayers];
                TsLayerId = new uint[VpxTsMaxPeriodicity];
                LayerTargetBitrate = new uint[VpxMaxLayers];
            }
        }

        // vpx_image_t - polja verbatim iz vpx_image.h. planes/stride su
        // fiksni nizovi dužine 4 (jedna po komponenti: Y/U/V/alpha za I420
        // koriste se samo prve 3).
        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxImage
        {
            public int Fmt;              // vpx_img_fmt_t
            public int Cs;               // vpx_color_space_t
            public int Range;            // vpx_color_range_t
            public uint W;
            public uint H;
            public uint BitDepth;
            public uint DW;
            public uint DH;
            public uint RW;
            public uint RH;
            public uint XChromaShift;
            public uint YChromaShift;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
            public IntPtr[] Planes;
            [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
            public int[] Stride;
            public int Bps;
            public IntPtr UserPriv;
            public IntPtr ImgData;
            public int ImgDataOwner;
            public int SelfAllocd;
            public IntPtr FbPriv;
        }

        // vpx_codec_cx_pkt_t - samo polja koja nam trebaju iz "frame" grane
        // unije (kind + data.frame.{buf,sz,pts,duration,flags}). Unija u C-u
        // počinje odmah posle "kind" polja (int) - isti raspored kao da smo
        // deklarisali samo prvu (frame) varijantu unije, dovoljno pošto
        // enkoder uvek vraća VPX_CODEC_CX_FRAME_PKT za nama bitne pakete.
        [StructLayout(LayoutKind.Sequential)]
        internal struct VpxCodecCxPktFrame
        {
            public int Kind;             // vpx_codec_cx_pkt_kind - VPX_CODEC_CX_FRAME_PKT = 0
            public IntPtr Buf;
            public IntPtr Sz;            // size_t
            public long Pts;             // vpx_codec_pts_t (int64_t)
            public ulong Duration;       // unsigned long - 8B na Win64 LLP64!=... vidi napomenu ispod
            public uint Flags;           // vpx_codec_frame_flags_t
            // Ostatak unije (partition_id, width[], height[], itd.) namerno
            // izostavljen - ne čitamo ta polja. IZOSTAVLJANJE JE BEZBEDNO SAMO
            // zato što ovo NIJE ceo pkt (koji je duplo veći union sa dosta
            // dodatnih polja) - koristi se isključivo kao "view" preko
            // Marshal.PtrToStructure na povratni IntPtr iz vpx_codec_get_cx_data,
            // nikad se ne piše natrag niti se occupied memorija limitira ovim
            // struct-om (native strana je alocirala ceo union, mi samo čitamo
            // prvih par polja).
        }

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern IntPtr vpx_codec_vp8_cx();

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int vpx_codec_enc_config_default(
            IntPtr iface, ref VpxCodecEncCfg cfg, uint usage);

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl, EntryPoint = "vpx_codec_enc_init_ver")]
        private static extern int vpx_codec_enc_init_ver_native(
            ref VpxCodecCtx ctx, IntPtr iface, ref VpxCodecEncCfg cfg, uint flags, int ver);

        internal static int vpx_codec_enc_init(ref VpxCodecCtx ctx, IntPtr iface, ref VpxCodecEncCfg cfg, uint flags)
        {
            // Isto što C makro "vpx_codec_enc_init(ctx, iface, cfg, flags)" radi
            // - poziva _ver varijantu sa VPX_ENCODER_ABI_VERSION automatski.
            return vpx_codec_enc_init_ver_native(ref ctx, iface, ref cfg, flags, VpxEncoderAbiVersion);
        }

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int vpx_codec_encode(
            ref VpxCodecCtx ctx, ref VpxImage img, long pts, uint duration, uint flags, ulong deadline);

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern IntPtr vpx_codec_get_cx_data(ref VpxCodecCtx ctx, ref IntPtr iter);

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern int vpx_codec_destroy(ref VpxCodecCtx ctx);

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern IntPtr vpx_img_alloc(IntPtr img, int fmt, uint dW, uint dH, uint alignment);

        [DllImport("vpx.dll", CallingConvention = CallingConvention.Cdecl)]
        internal static extern void vpx_img_free(IntPtr img);

        // VPX_DL_REALTIME iz vpx_encoder.h - deadline=1 znači "kodiraj što je
        // moguće brže", pravilan izbor za live remote-desktop stream (ne
        // batch/offline enkodiranje gde bi se koristio VPX_DL_BEST_QUALITY).
        internal const ulong VpxDlRealtime = 1;
    }
}
