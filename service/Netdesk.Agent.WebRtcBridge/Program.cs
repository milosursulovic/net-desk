using System;
using System.Security.Authentication;
using System.Threading;
using Newtonsoft.Json.Linq;
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
    ///
    /// NIJE runtime testirano - nema Windows mašine/prijavljenog korisnika/
    /// pravog WebRTC peer-a u ovoj sesiji da se ovaj proces stvarno pokrene.
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
            if (args.Length < 4)
            {
                Console.Error.WriteLine("Očekivano: <serverBaseUrl> <sessionId> <agentId> <apiKey>");
                return 1;
            }

            var serverBaseUrl = args[0];
            var sessionId = args[1];
            var agentId = args[2];
            var apiKey = args[3];

            var wsUrl = $"{serverBaseUrl}/api/agents/webrtc-signaling?sessionId={sessionId}&agentId={Uri.EscapeDataString(agentId)}&apiKey={Uri.EscapeDataString(apiKey)}";

            _session = new WebRtcSession();
            _session.OnIceCandidateGenerated += candidate =>
            {
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
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                _stopSignal.Set();
            };

            _ws = new WebSocket(wsUrl);
            _ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
            _ws.OnMessage += OnSignalingMessage;
            _ws.OnClose += (s, e) => _stopSignal.Set();
            _ws.OnError += (s, e) => _stopSignal.Set();
            _ws.Connect();

            if (!_ws.IsAlive)
            {
                Console.Error.WriteLine("Neuspešno povezivanje na signaling endpoint.");
                return 1;
            }

            StartOfferHandshake();

            // Blokira dok se sesija ne završi (fallback, viewer prekine,
            // WS se zatvori) - ovaj proces nema drugi posao osim da drži
            // WebRTC sesiju živu.
            _stopSignal.Wait();

            _session.Dispose();
            if (_ws.IsAlive) _ws.Close();
            return 0;
        }

        private static async void StartOfferHandshake()
        {
            try
            {
                var offer = await _session.CreateOfferAsync().ConfigureAwait(false);
                SendSignalingMessage(new JObject { ["type"] = "offer", ["sdp"] = offer.sdp });
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Neuspešno kreiranje offer-a: " + ex.Message);
                _stopSignal.Set();
            }
        }

        private static void SendSignalingMessage(JObject message)
        {
            if (_ws?.IsAlive == true) _ws.Send(message.ToString(Newtonsoft.Json.Formatting.None));
        }

        private static void OnSignalingMessage(object sender, MessageEventArgs e)
        {
            if (!e.IsText) return;
            try
            {
                var json = JObject.Parse(e.Data);
                var type = (string)json["type"];
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
                        if (!_session.Start())
                        {
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
                        _stopSignal.Set();
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Neispravna signaling poruka: " + ex.Message);
            }
        }
    }
}
