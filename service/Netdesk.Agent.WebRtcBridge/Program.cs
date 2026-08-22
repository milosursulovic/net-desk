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
            var logPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "NetdeskAgent", "webrtc-bridge.log");
            FileLogger.Initialize(logPath);

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

            FileLogger.Info("WebRtcBridge pokrenut. sessionId=" + sessionId + " agentId=" + agentId);

            var wsUrl = $"{serverBaseUrl}/api/agents/webrtc-signaling?sessionId={sessionId}&agentId={Uri.EscapeDataString(agentId)}&apiKey={Uri.EscapeDataString(apiKey)}";

            _session = new WebRtcSession();
            _session.OnIceCandidateGenerated += candidate =>
            {
                FileLogger.Info("ICE kandidat generisan (" + candidate.candidate + ") - šaljem signaling.");
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
                FileLogger.Warn("WebRTC konekcija neuspešna (ICE failed/closed) - javljam 'failed' i gasim se.");
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                _stopSignal.Set();
            };

            _ws = new WebSocket(wsUrl);
            _ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
            _ws.OnMessage += OnSignalingMessage;
            _ws.OnClose += (s, e) =>
            {
                FileLogger.Info("Signaling WS zatvoren (code=" + e.Code + " reason=" + e.Reason + ").");
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
            FileLogger.Info("Signaling WS povezan (" + wsUrl.Split('?')[0] + ").");

            StartOfferHandshake();

            // Blokira dok se sesija ne završi (fallback, viewer prekine,
            // WS se zatvori) - ovaj proces nema drugi posao osim da drži
            // WebRTC sesiju živu.
            _stopSignal.Wait();

            _session.Dispose();
            if (_ws.IsAlive) _ws.Close();
            FileLogger.Info("WebRtcBridge se gasi.");
            return 0;
        }

        private static async void StartOfferHandshake()
        {
            try
            {
                var offer = await _session.CreateOfferAsync().ConfigureAwait(false);
                FileLogger.Info("SDP offer kreiran, šaljem signaling.");
                SendSignalingMessage(new JObject { ["type"] = "offer", ["sdp"] = offer.sdp });
            }
            catch (Exception ex)
            {
                FileLogger.Error("Neuspešno kreiranje offer-a", ex);
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
                FileLogger.Info("Signaling poruka primljena: " + type);

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
                            FileLogger.Info("Capture+encoder pokrenuti, čekam ICE/DTLS konekciju.");
                        }
                        else
                        {
                            FileLogger.Error("WebRtcSession.Start() neuspešan (capture ili enkoder inicijalizacija) - javljam 'failed'.", null);
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
                        FileLogger.Info("'stop' primljen od servera - gasim se.");
                        _stopSignal.Set();
                        break;
                    default:
                        FileLogger.Warn("Nepoznat tip signaling poruke: " + type);
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
