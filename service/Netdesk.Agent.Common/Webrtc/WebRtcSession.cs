using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Logging;
using SIPSorcery.Net;
using SIPSorceryMedia.Abstractions;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// Vezuje ScreenCapture + VpxInterop (VP8 enkoder) + SIPSorcery
    /// RTCPeerConnection + InputInjector u jednu sesiju - agent-strana
    /// ekvivalent onome što Vnc/VncBridge.cs radi za RFB put, samo umesto
    /// bajt-blind proksiranja ka UltraVNC-u, ovde se ekran STVARNO hvata i
    /// enkoduje ovde.
    ///
    /// Namenjeno da se instancira UNUTAR Netdesk.Agent.WebRtcBridge.exe, koji
    /// se sad pokreće kao trajan Scheduled Task "at logon" (genuinski
    /// interaktivan korisnički logon - vidi napomenu na vrhu
    /// WebRtcBridge/Program.cs zašto je ovo zamenilo stari
    /// SessionLauncher/CreateProcessWithTokenW pristup) - NE direktno u
    /// Netdesk.Agent.Service (Session 0) procesu, jer i ScreenCapture (DXGI)
    /// i InputInjector (SendInput) zahtevaju pristup interaktivnom desktop-u.
    ///
    /// SIPSorcery API pozivi ovde (RTCPeerConnection/MediaStreamTrack/
    /// VideoFormat/createDataChannel/SendVideo/createOffer) su UŽIVO
    /// provereni protiv stvarno restore-ovanog SIPSorcery 10.0.16 paketa na
    /// net472 - nisu nagađani iz dokumentacije. Capture->encode->send ciklus
    /// je UŽIVO potvrđen (DXGI Desktop Duplication, pravi frejmovi) kad
    /// proces radi kao genuinski interaktivno ulogovan korisnik.
    /// </summary>
    public sealed class WebRtcSession : IDisposable
    {
        private const uint VpxUsage = 0; // g_usage mora biti 0 (deprecated polje, vidi vpx_encoder.h komentar)
        private const int TargetFps = 15; // konzervativno za remote-desktop sadržaj preko WAN-a, ne 30/60
        private const int TargetBitrateKbps = 1500;

        private readonly RTCPeerConnection _pc;
        private readonly ScreenCapture _capture = new ScreenCapture();
        private VpxInterop.VpxCodecCtx _encCtx;
        private bool _encoderInitialized;
        private CancellationTokenSource _captureLoopCts;
        private Task _captureLoopTask;
        private long _frameCounter;
        private bool _loggedFirstCaptureError;

        public event Action<RTCIceCandidate> OnIceCandidateGenerated;
        public event Action OnConnectionFailed;

        // Dodatno uz FileLogger (koji zavisi od lokalnog fajl-sistema tog
        // korisničkog profila - uživo se pokazalo nepouzdanim, videti
        // Program.cs napomenu) - Program.cs se pretplaćuje na ovo i
        // prosleđuje iste poruke preko signaling WS-a, koji backend već
        // BEZUSLOVNO snima u vnc_webrtc_signaling tabelu (persistMessage u
        // ws/webrtcSignaling.js, pre bilo kakvog grananja po tipu poruke) -
        // pouzdaniji kanal za dijagnostiku od bilo čega lokalnog na
        // klijentskoj mašini.
        public event Action<string> OnDiagnostic;

        private void Diag(string message)
        {
            FileLogger.Info(message);
            try { OnDiagnostic?.Invoke(message); } catch { /* best effort */ }
        }

        private void DiagError(string message, Exception ex)
        {
            FileLogger.Error(message, ex);
            try { OnDiagnostic?.Invoke("ERROR " + message + (ex == null ? "" : ": " + ex.Message)); } catch { /* best effort */ }
        }

        public WebRtcSession()
        {
            // Bez iceServers, ICE gathering daje SAMO host kandidate (lokalna
            // LAN adresa) - uživo potvrđeno 2026-08-24: radi kad su agent i
            // viewer na istoj mreži (host adresa je direktno dostižna), ali
            // NIKAD ne uspeva preko interneta/NAT-a (viewer izvan interne
            // mreže vidi requestsSent rasti dok responsesReceived ostaje 0 -
            // host adresa poput 10.230.62.100 nije rutabilna sa interneta).
            // STUN otkriva server-reflexive (javnu NAT) adresu na obe strane,
            // dovoljno za većinu "full cone"/"restricted cone" NAT tipova.
            // NIJE dovoljno za simetrični NAT ili restriktivne firewall-ove
            // (česti u korporativnim/bolničkim mrežama) - to zahteva TURN
            // relay, koji NIJE ovde postavljen (zaseban infrastrukturni
            // zadatak, van dosega ove izmene). Isti STUN URL MORA biti
            // podešen i na frontend strani (VncSessionView.vue) - ICE
            // gathering je nezavisan na obe strane, ne razmenjuje se preko
            // signaling-a.
            var config = new RTCConfiguration
            {
                iceServers = new List<RTCIceServer>
                {
                    new RTCIceServer { urls = "stun:stun.l.google.com:19302" },
                },
            };
            _pc = new RTCPeerConnection(config);
            var videoFormat = new VideoFormat(VideoCodecsEnum.VP8, 96);
            var track = new MediaStreamTrack(videoFormat);
            _pc.addTrack(track);

            _pc.onicecandidate += (candidate) =>
            {
                if (candidate != null) OnIceCandidateGenerated?.Invoke(candidate);
            };

            // "failed" pokriva ICE neuspeh - signal za backend/frontend fallback
            // na RFB (vidi Faza 2 plan, markVncSessionFallback). "disconnected"
            // se namerno NE tretira kao trajni fail ovde - to je često
            // privremeno (kratak mrežni prekid), ICE ume sam da se oporavi;
            // samo "failed"/"closed" su konačni.
            _pc.onconnectionstatechange += (state) =>
            {
                Diag("RTCPeerConnection stanje: " + state);
                if (state == RTCPeerConnectionState.failed || state == RTCPeerConnectionState.closed)
                {
                    OnConnectionFailed?.Invoke();
                }
            };

            _pc.ondatachannel += (channel) =>
            {
                channel.onmessage += OnInputDataChannelMessage;
            };
        }

        /// <summary>
        /// Agent je uvek strana koja pravi offer (on dodaje video track i
        /// data channel - browser samo prima/odgovara), simetrično sa RFB
        /// puta gde agent takođe inicira WS konekciju ka backend-u.
        /// </summary>
        public async Task<RTCSessionDescriptionInit> CreateOfferAsync()
        {
            // Data channel se mora kreirati PRE createOffer-a da bi SCTP
            // m-line uopšte ušla u SDP - dokumentovano SIPSorcery/WebRTC
            // ponašanje, ne proizvoljan redosled.
            await _pc.createDataChannel("input").ConfigureAwait(false);

            var offer = _pc.createOffer(null);
            await _pc.setLocalDescription(offer).ConfigureAwait(false);
            return offer;
        }

        public void SetRemoteAnswer(RTCSessionDescriptionInit answer)
        {
            _pc.setRemoteDescription(answer);
        }

        public void AddRemoteIceCandidate(RTCIceCandidateInit candidate)
        {
            _pc.addIceCandidate(candidate);
        }

        /// <summary>
        /// Samostalni test capture inicijalizacije/jednog frejma, BEZ
        /// signaling/ICE/enkodera - korišćeno da se uživo dokaže (2026-08-24)
        /// da genuinski interaktivan logon (Scheduled Task "at logon") daje
        /// pravi DXGI pristup tamo gde stari session-retargetovan SYSTEM
        /// token (bivši SessionLauncher.cs) nije. Zadržano kao trajan
        /// dijagnostički alat - pokreće se preko "--test-capture" argv flaga
        /// u WebRtcBridge/Program.cs.
        /// </summary>
        public static string TestCaptureOnce()
        {
            using (var capture = new ScreenCapture())
            {
                if (!capture.Initialize())
                {
                    return "Initialize() neuspešan (ni DXGI ni GDI fallback).";
                }

                var path = capture.UsingGdiFallback ? "GDI fallback" : "DXGI";
                var frame = capture.CaptureFrameBgra(2000);
                var frameResult = frame == null
                    ? "CaptureFrameBgra() vratio null"
                    : "CaptureFrameBgra() vratio " + frame.Length + " bajtova (uspeh)";
                return "Capture (" + capture.Width + "x" + capture.Height + ", " + path + "): " + frameResult;
            }
        }

        /// <summary>
        /// Pokreće capture->encode->send petlju na sopstvenom background
        /// task-u. Vraća false bez bacanja izuzetka ako capture/enkoder
        /// inicijalizacija ne uspe (poziv sloj treba to da tretira kao
        /// "WebRTC nije uspeo ovde", isti fallback signal kao ICE failure).
        /// </summary>
        public bool Start()
        {
            if (!_capture.Initialize())
            {
                DiagError("ScreenCapture.Initialize() neuspešan (ni DXGI ni GDI fallback nisu uspeli)", null);
                return false;
            }
            if (!InitializeEncoder())
            {
                DiagError("VP8 enkoder inicijalizacija neuspešna (vpx_codec_enc_config_default/enc_init)", null);
                return false;
            }

            Diag("Capture (" + _capture.Width + "x" + _capture.Height + ", " +
                (_capture.UsingGdiFallback ? "GDI fallback" : "DXGI") +
                ") + VP8 enkoder inicijalizovani, pokrećem capture petlju.");
            _captureLoopCts = new CancellationTokenSource();
            _captureLoopTask = Task.Run(() => CaptureLoop(_captureLoopCts.Token));
            return true;
        }

        private bool InitializeEncoder()
        {
            var cfg = new VpxInterop.VpxCodecEncCfg();
            cfg.AllocateArrays();
            var iface = VpxInterop.vpx_codec_vp8_cx();
            if (VpxInterop.vpx_codec_enc_config_default(iface, ref cfg, VpxUsage) != (int)VpxInterop.VpxCodecErr.Ok)
            {
                return false;
            }

            cfg.GW = (uint)_capture.Width;
            cfg.GH = (uint)_capture.Height;
            cfg.GTimebase = new VpxInterop.VpxRational { Num = 1, Den = TargetFps };
            cfg.RcTargetBitrate = TargetBitrateKbps;
            cfg.RcEndUsage = (int)VpxInterop.VpxRcMode.Cbr;
            cfg.GPass = (int)VpxInterop.VpxEncPass.OnePass;
            // Realtime remote-desktop prioritet: brzina/kašnjenje nad kvalitetom
            // pri jednakom bitrate-u - isti kompromis koji npr. video-poziv
            // enkoderi biraju, ne "najbolji mogući" fajl na disku.
            cfg.RcMinQuantizer = 2;
            cfg.RcMaxQuantizer = 56;
            cfg.GLagInFrames = 0; // nema lookahead - svaki frejm se odmah enkoduje i šalje

            _encCtx = new VpxInterop.VpxCodecCtx();
            var initResult = VpxInterop.vpx_codec_enc_init(ref _encCtx, iface, ref cfg, 0);
            _encoderInitialized = initResult == (int)VpxInterop.VpxCodecErr.Ok;
            return _encoderInitialized;
        }

        private async Task CaptureLoop(CancellationToken token)
        {
            var frameIntervalMs = 1000 / TargetFps;
            var yPlane = new byte[_capture.Width * _capture.Height];
            var uPlane = new byte[(_capture.Width / 2) * (_capture.Height / 2)];
            var vPlane = new byte[(_capture.Width / 2) * (_capture.Height / 2)];
            // Watchdog za "konekcija radi, ekran ostaje crn" klasu bugova:
            // CaptureFrameBgra() koji stalno vraća null se inače ne loguje
            // NIGDE (tretira se kao normalno "ekran se nije promenio"), pa je
            // prvi uživo bug ovog tipa (GDI fallback stub) bio potpuno tih u
            // logovima. Ako 5s od starta petlje nijedan frejm nije poslat,
            // to više nije normalno mirovanje ekrana - vredno je jednog loga.
            var noFrameWarningThreshold = TargetFps * 5;
            var iterationsSinceStart = 0;
            var loggedNoFramesWarning = false;

            while (!token.IsCancellationRequested)
            {
                var loopStart = DateTime.UtcNow;
                try
                {
                    var bgra = _capture.CaptureFrameBgra(frameIntervalMs);
                    if (bgra != null)
                    {
                        ScreenCapture.BgraToI420(bgra, _capture.Width, _capture.Height, yPlane, uPlane, vPlane);
                        EncodeAndSendFrame(yPlane, uPlane, vPlane);
                    }
                }
                catch (Exception ex)
                {
                    // Best-effort po frejmu - jedan neuspeo capture/encode ciklus
                    // ne sme da obori celu sesiju (isti "graceful degrade" duh
                    // kao RFB relay-a koji samo loguje i nastavlja). Sesija se
                    // gasi samo preko eksplicitnog Stop()/onconnectionstatechange.
                    // Loguje se SAMO prvi put (na ~15 FPS bi ponavljanje na
                    // svaki frejm potpuno zatrpalo log bez nove informacije) -
                    // prvi izuzetak već kaže sve što treba za dijagnozu.
                    if (!_loggedFirstCaptureError)
                    {
                        _loggedFirstCaptureError = true;
                        DiagError("Capture/encode ciklus greška (dalja ponavljanja se ne loguju)", ex);
                    }
                }

                iterationsSinceStart++;
                if (!loggedNoFramesWarning && _frameCounter == 0 && iterationsSinceStart >= noFrameWarningThreshold)
                {
                    loggedNoFramesWarning = true;
                    DiagError(
                        "Nijedan frejm nije uspešno uhvaćen/poslat " + (noFrameWarningThreshold / TargetFps) +
                        "s od starta capture petlje (CaptureFrameBgra stalno vraća null) - " +
                        (_capture.UsingGdiFallback ? "GDI" : "DXGI") + " put verovatno ne isporučuje frejmove.",
                        null);
                }

                var elapsed = (DateTime.UtcNow - loopStart).TotalMilliseconds;
                var delay = frameIntervalMs - (int)elapsed;
                if (delay > 0) await Task.Delay(delay, token).ConfigureAwait(false);
            }
        }

        private unsafe void EncodeAndSendFrame(byte[] yPlane, byte[] uPlane, byte[] vPlane)
        {
            if (!_encoderInitialized) return;

            fixed (byte* yPtr = yPlane)
            fixed (byte* uPtr = uPlane)
            fixed (byte* vPtr = vPlane)
            {
                var img = new VpxInterop.VpxImage
                {
                    Fmt = VpxInterop.VpxImgFmtI420,
                    W = (uint)_capture.Width,
                    H = (uint)_capture.Height,
                    DW = (uint)_capture.Width,
                    DH = (uint)_capture.Height,
                    Planes = new IntPtr[4],
                    Stride = new int[4],
                };
                img.Planes[0] = (IntPtr)yPtr;
                img.Planes[1] = (IntPtr)uPtr;
                img.Planes[2] = (IntPtr)vPtr;
                img.Stride[0] = _capture.Width;
                img.Stride[1] = _capture.Width / 2;
                img.Stride[2] = _capture.Width / 2;

                var pts = _frameCounter++;
                var encodeResult = VpxInterop.vpx_codec_encode(
                    ref _encCtx, ref img, pts, 1, 0, VpxInterop.VpxDlRealtime);
                if (encodeResult != (int)VpxInterop.VpxCodecErr.Ok) return;

                IntPtr iter = IntPtr.Zero;
                IntPtr pktPtr;
                while ((pktPtr = VpxInterop.vpx_codec_get_cx_data(ref _encCtx, ref iter)) != IntPtr.Zero)
                {
                    var pkt = System.Runtime.InteropServices.Marshal.PtrToStructure<VpxInterop.VpxCodecCxPktFrame>(pktPtr);
                    // VPX_CODEC_CX_FRAME_PKT == 0 - jedina vrsta paketa koju
                    // producira jednoprolazni CBR VP8 enkoder ovde (nema
                    // statistika za dvoprolazno enkodiranje).
                    if (pkt.Kind != 0) continue;

                    var frameBytes = new byte[(long)pkt.Sz];
                    System.Runtime.InteropServices.Marshal.Copy(pkt.Buf, frameBytes, 0, frameBytes.Length);
                    // SendVideo(uint durationRtpUnits, byte[] sample) - SIPSorcery
                    // sam radi VP8 RTP payload-izaciju/paketizaciju iznutra,
                    // ovaj sloj samo predaje ceo enkodovan VP8 frejm.
                    _pc.SendVideo((uint)(90000 / TargetFps), frameBytes);
                }
            }
        }

        /// <summary>
        /// Očekivani protokol poruka sa browser strane (frontend piše JSON
        /// preko RTCDataChannel-a): {"t":"move","x":0.5,"y":0.5} |
        /// {"t":"button","b":"left","down":true} | {"t":"wheel","d":-120} |
        /// {"t":"key","scan":30,"down":true,"ext":false} ("ext" opciono,
        /// default false - true za strelice/Insert/Delete/Home/End/PageUp/
        /// PageDown/desni Ctrl-Alt, vidi InputInjector.KeyEvent). Namerno minimalan/ad-hoc
        /// format (ne postoji poseban shared shema fajl još) - usaglasiti sa
        /// frontend implementacijom u Fazi 3 pre nego što se smatra
        /// finalnim.
        /// </summary>
        private void OnInputDataChannelMessage(RTCDataChannel channel, DataChannelPayloadProtocols protocol, byte[] data)
        {
            try
            {
                var json = JObject.Parse(Encoding.UTF8.GetString(data));
                var type = (string)json["t"];
                switch (type)
                {
                    case "move":
                        InputInjector.MoveMouse((double)json["x"], (double)json["y"]);
                        break;
                    case "button":
                        var button = (string)json["b"] == "right" ? InputInjector.MouseButton.Right
                            : (string)json["b"] == "middle" ? InputInjector.MouseButton.Middle
                            : InputInjector.MouseButton.Left;
                        InputInjector.MouseButtonEvent(button, (bool)json["down"]);
                        break;
                    case "wheel":
                        InputInjector.MouseWheel((int)json["d"]);
                        break;
                    case "key":
                        InputInjector.KeyEvent(
                            (ushort)json["scan"], (bool)json["down"], (bool?)json["ext"] ?? false);
                        break;
                }
            }
            catch (Exception)
            {
                // Best-effort - jedna loše-formirana input poruka ne sme da
                // obori data channel/sesiju.
            }
        }

        public void Stop()
        {
            try { _captureLoopCts?.Cancel(); } catch (ObjectDisposedException) { }
            try { _captureLoopTask?.Wait(2000); } catch (Exception) { }
            _pc.close();
        }

        public void Dispose()
        {
            Stop();
            if (_encoderInitialized)
            {
                VpxInterop.vpx_codec_destroy(ref _encCtx);
            }
            _capture.Dispose();
            _captureLoopCts?.Dispose();
        }
    }
}
