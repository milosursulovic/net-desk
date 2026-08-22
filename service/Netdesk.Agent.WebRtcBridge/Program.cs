using System;
using System.IO;
using System.Security.Authentication;
using System.Threading;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Webrtc;
using SIPSorcery.Net;
using WebSocketSharp;

namespace NetdeskAgent.WebRtcBridge
{
    /// <summary>
    /// Companion proces koji SessionLauncher (Netdesk.Agent.Common/Webrtc/)
    /// pokreće preko CreateProcessAsUser UNUTAR interaktivne korisničke
    /// sesije - postoji isključivo zato što Netdesk.Agent.Service (Session 0,
    /// LocalSystem) ne može sam da radi DXGI capture ni SendInput (vidi
    /// SessionLauncher.cs). Argumenti se prosleđuju preko komandne linije
    /// (vidi AgentWorker.cs poziv) - NIJE hardened protiv drugih lokalnih
    /// procesa/naloga koji bi mogli da vide komandnu liniju preko Task
    /// Manager-a/WMI-ja (apiKey bi im bio vidljiv) - prihvatljivo za
    /// prototip/spike fazu, trebalo bi ojačati (named pipe umesto argv) pre
    /// stvarnog rollout-a na pilot grupu.
    ///
    /// Koristi websocket-sharp (isti izbor kao Vnc/VncBridge.cs, isti Win7-
    /// -kompatibilni razlog ne primenjuje se ovde pošto je ovaj tier
    /// net472-only, ali nema razloga uvoditi DRUGU WS biblioteku samo za
    /// ovaj put - manje zavisnosti, ista dokazana konfiguracija TLS-a).
    /// </summary>
    internal static class Program
    {
        private static WebRtcSession _session;
        private static WebSocket _ws;
        private static readonly ManualResetEventSlim _stopSignal = new ManualResetEventSlim(false);

        // Args: [0]=serverBaseUrl (npr. wss://netdesk.local:5138), [1]=sessionId,
        // [2]=agentId, [3]=apiKey. Isti redosled kao VncBridge.RunAsync
        // parametri, radi konzistentnosti između dva bridge poziva u
        // AgentWorker.cs.
        private static int Main(string[] args)
        {
            // Log fajl u KORISNIKOVOM profilu, ne %ProgramData%\NetdeskAgent -
            // ovaj proces radi pod interaktivnim korisničkim tokenom
            // (CreateProcessAsUser), ne LocalSystem, pa se ne može
            // garantovati write pristup deljenom ProgramData folderu koji
            // Agent servis (LocalSystem) koristi/kreira. Otkriveno uživo:
            // prva verzija ovog fajla nije imala NIKAKVO logovanje (samo
            // Console.Error.WriteLine u proces bez konzole/redirekcije - išlo
            // je u nikuda), pa je prvi pravi test na terenu ostao
            // nedijagnostikovan (WebRTC bridge se pokrenuo, ali dalje se nije
            // znalo šta se dešava).
            //
            // NAMERNO Environment.GetEnvironmentVariable("LOCALAPPDATA") (obična
            // env promenljiva, koju SessionLauncher.CreateEnvironmentBlock već
            // popunjava za pravog korisnika), NE
            // Environment.GetFolderPath(SpecialFolder.LocalApplicationData) -
            // ta druga poziva SHGetKnownFolderPath, koji zahteva da je
            // korisnikov registry hive (HKEY_CURRENT_USER) učitan u ovaj
            // proces. SessionLauncher.cs NIKAD ne zove LoadUserProfile() (samo
            // CreateEnvironmentBlock) - uživo POTVRĐENO uzrok zašto se log
            // fajl NIKAD nije pojavio: GetFolderPath je bacao izuzetak OVDE,
            // PRE bilo kakvog try/catch-a, gasio ceo proces potpuno tiho, čak
            // i posle dodavanja "sveg" logovanja u prethodnoj izmeni. Ceo ovaj
            // blok je sad u sopstvenom try/catch - ako i env-var pristup ikad
            // padne, proces nastavlja BEZ logovanja umesto da se ugasi pre
            // nego što je i pokušao WebRTC posao.
            try
            {
                var localAppData = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                var baseDir = !string.IsNullOrEmpty(localAppData) ? localAppData : Path.GetTempPath();
                var logPath = Path.Combine(baseDir, "NetdeskAgent", "webrtc-bridge.log");
                FileLogger.Initialize(logPath);
            }
            catch
            {
                // Best-effort - nastavi bez logovanja radije nego da se
                // proces ugasi pre nego što je i pokušao WebRTC posao.
            }

            try
            {
                return RunMain(args);
            }
            catch (Exception ex)
            {
                // Ništa iznad ovoga ne hvata izuzetke - bez ovog spoljašnjeg
                // try/catch, npr. pad u WebRtcSession konstruktoru (SIPSorcery/
                // SharpDX inicijalizacija) bi ugasio proces potpuno tiho.
                FileLogger.Error("Neuhvaćen izuzetak u WebRtcBridge-u - proces se gasi", ex);
                return 1;
            }
        }

        private static int RunMain(string[] args)
        {
            if (args.Length < 4)
            {
                FileLogger.Error("Očekivano 4 argumenta (serverBaseUrl, sessionId, agentId, apiKey), dobijeno " + args.Length, null);
                return 1;
            }

            var serverBaseUrl = args[0];
            var sessionId = args[1];
            var agentId = args[2];
            var apiKey = args[3];

            Log("WebRtcBridge pokrenut. sessionId=" + sessionId + " agentId=" + agentId);

            var wsUrl = $"{serverBaseUrl}/api/agents/webrtc-signaling?sessionId={sessionId}&agentId={Uri.EscapeDataString(agentId)}&apiKey={Uri.EscapeDataString(apiKey)}";

            // Signaling WS se konektuje PRE WebRtcSession konstrukcije, namerno
            // obrnuto od prirodnog redosleda - ako WebRtcSession konstruktor
            // (SIPSorcery RTCPeerConnection/DTLS sertifikat generisanje,
            // SharpDX/DXGI inicijalizacija) baci izuzetak, taj izuzetak treba
            // da bude PRIJAVLJIV preko signaling kanala (koji backend
            // bezuslovno snima u vnc_webrtc_signaling - pouzdanije od lokalnog
            // fajla, videti FileLogger napomenu ispod). Da je WebRtcSession
            // konstruisan PRE WS konekcije, baš ta klasa najkritičnijih
            // padova (native/SIPSorcery inicijalizacija) bi ostala vidljiva
            // SAMO lokalnom fajlu, koji se uživo pokazao nepouzdanim.
            _ws = new WebSocket(wsUrl);
            _ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
            _ws.OnMessage += OnSignalingMessage;
            _ws.OnClose += (s, e) =>
            {
                Log("Signaling WS zatvoren (code=" + e.Code + " reason=" + e.Reason + ").");
                _stopSignal.Set();
            };
            _ws.OnError += (s, e) =>
            {
                FileLogger.Error("Signaling WS greška: " + e.Message, e.Exception);
                _stopSignal.Set();
            };
            _ws.Connect();

            if (!_ws.IsAlive)
            {
                FileLogger.Error("Signaling WS konekcija neuspešna (IsAlive=false posle Connect()) - proverava se URL/TLS/auth.", null);
                return 1;
            }
            Log("Signaling WS povezan (" + wsUrl.Split('?')[0] + ").");

            try
            {
                _session = new WebRtcSession();
            }
            catch (Exception ex)
            {
                // Sad JESTE prijavljivo - WS je već gore, poruka stiže do
                // servera čak i ako je ovo baš onaj pad koji je do sad bio
                // potpuno nevidljiv.
                Log("WebRtcSession konstrukcija neuspešna: " + ex);
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                return 1;
            }

            _session.OnDiagnostic += msg => Log(msg);
            _session.OnIceCandidateGenerated += candidate =>
            {
                Log("ICE kandidat generisan (" + candidate.candidate + ") - šaljem signaling.");
                SendSignalingMessage(new JObject
                {
                    ["type"] = "ice",
                    ["candidate"] = candidate.candidate,
                    ["sdpMid"] = candidate.sdpMid,
                    ["sdpMLineIndex"] = candidate.sdpMLineIndex,
                });
            };
            _session.OnConnectionFailed += () =>
            {
                // Signalizuje nazad backend-u da je WebRTC put propao, kako bi
                // vncSessions.service.js mogao da prebaci session_type na 'rfb'
                // i pokrene postojeći start_vnc_bridge job za isti sessionId
                // (Faza 2 fallback mehanizam iz plana). Proces se posle ovoga
                // gasi - nema smisla da ostane živ bez konekcije.
                Log("WebRTC konekcija neuspešna (ICE failed/closed) - javljam 'failed' i gasim se.");
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                _stopSignal.Set();
            };

            StartOfferHandshake();

            // Blokira dok se sesija ne završi (fallback, viewer prekine,
            // WS se zatvori) - ovaj proces nema drugi posao osim da drži
            // WebRTC sesiju živu.
            _stopSignal.Wait();

            _session.Dispose();
            if (_ws.IsAlive) _ws.Close();
            Log("WebRtcBridge se gasi.");
            return 0;
        }

        /// <summary>
        /// Loguje lokalno (best-effort, FileLogger - uživo se pokazao
        /// nepouzdanim pod CreateProcessAsUser tokenom, videti napomenu u
        /// Main()) I preko signaling WS-a kao {"type":"log"} poruka - backend
        /// (persistMessage u ws/webrtcSignaling.js) snima SVAKU signaling
        /// poruku u vnc_webrtc_signaling tabelu BEZUSLOVNO, pre bilo kakvog
        /// grananja po tipu, pa je ovo u praksi pouzdaniji dijagnostički kanal
        /// od bilo čega na samoj klijentskoj mašini. Viewer strana (frontend)
        /// nepoznate tipove poruka (uključujući "log") tiho ignoriše - ne
        /// remeti postojeći "offer"/"ice"/"fallback" tok.
        /// </summary>
        private static void Log(string message)
        {
            FileLogger.Info(message);
            if (_ws?.IsAlive == true)
            {
                try { _ws.Send(new JObject { ["type"] = "log", ["message"] = message }.ToString(Newtonsoft.Json.Formatting.None)); }
                catch { /* best effort */ }
            }
        }

        private static async void StartOfferHandshake()
        {
            try
            {
                var offer = await _session.CreateOfferAsync().ConfigureAwait(false);
                Log("SDP offer kreiran, šaljem signaling.");
                SendSignalingMessage(new JObject { ["type"] = "offer", ["sdp"] = offer.sdp });
            }
            catch (Exception ex)
            {
                Log("Neuspešno kreiranje offer-a: " + ex);
                _stopSignal.Set();
            }
        }

        private static void SendSignalingMessage(JObject message)
        {
            if (_ws?.IsAlive == true)
            {
                _ws.Send(message.ToString(Newtonsoft.Json.Formatting.None));
            }
            else
            {
                FileLogger.Warn("Signaling WS nije živ - poruka tipa '" + message["type"] + "' NIJE poslata.");
            }
        }

        private static void OnSignalingMessage(object sender, MessageEventArgs e)
        {
            if (!e.IsText) return;
            try
            {
                var json = JObject.Parse(e.Data);
                var type = (string)json["type"];
                Log("Signaling poruka primljena: " + type);

                switch (type)
                {
                    case "answer":
                        _session.SetRemoteAnswer(new RTCSessionDescriptionInit
                        {
                            type = RTCSdpType.answer,
                            sdp = (string)json["sdp"],
                        });
                        // Capture/encode petlja kreće tek pošto je SDP razmena
                        // gotova - ICE/DTLS handshake se dešava asinhrono
                        // ispod SIPSorcery-a nakon setRemoteDescription-a,
                        // SendVideo pozivi pre nego što je transport spreman
                        // se očekuje da su bezbedni no-op-ovi (SIPSorcery-ovo
                        // interno ponašanje, nije posebno provereno ovde).
                        if (_session.Start())
                        {
                            Log("Capture+encoder pokrenuti, čekam ICE/DTLS konekciju.");
                        }
                        else
                        {
                            Log("WebRtcSession.Start() neuspešan (capture ili enkoder inicijalizacija) - javljam 'failed'.");
                            SendSignalingMessage(new JObject { ["type"] = "failed" });
                            _stopSignal.Set();
                        }
                        break;
                    case "ice":
                        _session.AddRemoteIceCandidate(new RTCIceCandidateInit
                        {
                            candidate = (string)json["candidate"],
                            sdpMid = (string)json["sdpMid"],
                            sdpMLineIndex = (ushort)(json["sdpMLineIndex"]?.Value<int>() ?? 0),
                        });
                        break;
                    case "stop":
                        Log("'stop' primljen od servera - gasim se.");
                        _stopSignal.Set();
                        break;
                    default:
                        Log("Nepoznat tip signaling poruke: " + type);
                        break;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Neispravna signaling poruka", ex);
            }
        }
    }
}
