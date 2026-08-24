using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Authentication;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Webrtc;
using SIPSorcery.Net;
using WebSocketSharp;

namespace NetdeskAgent.WebRtcBridge
{
    /// <summary>
    /// Persistent per-sesijski helper, registrovan kao Scheduled Task koji se
    /// pokreće "at logon" (bilo koji korisnik, interaktivno, "Run only when
    /// user is logged on") - NE više na zahtev preko SessionLauncher-a
    /// (CreateProcessAsUser/CreateProcessWithTokenW iz Session 0 servisa).
    ///
    /// UŽIVO POTVRĐENO 2026-08-24: session-retargetovan SYSTEM token
    /// (SessionLauncher.cs, sad obrisan) je uspevao da pokrene proces i
    /// izbegne CLR crash, ali DXGI Desktop Duplication/GDI BitBlt NIKAD nisu
    /// videli pravi ekran (DXGI outputCount=0, BitBlt ERROR_INVALID_HANDLE) -
    /// ni za jedan token/desktop-targeting pokušaj isprobran u toj sesiji.
    /// Test preko Scheduled Task-a "at logon" (genuinski interaktivan logon,
    /// ne naknadno prikačen token) je ODMAH uspeo: prava rezolucija
    /// (1920x1080, ne 1024x768 fallback), pravi DXGI put, pun frejm. Zaključak:
    /// DXGI/GDI capture zahteva GENUINSKI interaktivni logon, ne samo
    /// ispravan window station/desktop naziv.
    ///
    /// Pošto se proces sad pokreće JEDNOM po logon-u (ne po WebRTC sesiji),
    /// on čeka na "pokreni sesiju sad" mailbox komandu
    /// (WebRtcBridgeCommand/WebRtcBridgeCommandClient, isti obrazac kao
    /// Service->Manager ManagerCommand) umesto da dobija sessionId/serverUrl/
    /// agentId/apiKey preko argv - vidi RunPersistentLoop/TryDequeueForActiveSession
    /// ispod. Ceo stari per-sesijski tok (SDP/ICE/capture/WebRtcSession) je
    /// nepromenjen, samo je premešten u RunOneSession i sad se izvršava u
    /// petlji umesto jednom pa exit.
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
        private static ManualResetEventSlim _stopSignal;

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        // Poll fallback ako FileSystemWatcher event promaši (poznato: watcher
        // može propustiti event pod određenim uslovima - isti razlog zašto
        // ManagerWorker.RunAsync kombinuje WakeEvent SA periodičnim tick-om
        // umesto da se osloni SAMO na signal).
        private const int MailboxPollFallbackMs = 3000;

        private static int Main(string[] args)
        {
            // Log fajl u KORISNIKOVOM profilu, ne %ProgramData%\NetdeskAgent -
            // ovaj proces sad radi kao genuinski ulogovan korisnik (Scheduled
            // Task "at logon"), ne LocalSystem, pa se ne može garantovati
            // write pristup deljenom ProgramData folderu koji Agent servis
            // (LocalSystem) koristi/kreira (vidi Paths.cs napomenu o zašto je
            // taj folder namerno ACL-ovan samo za LocalSystem/Administrators).
            //
            // NAMERNO Environment.GetEnvironmentVariable("LOCALAPPDATA")
            // (obična env promenljiva), NE
            // Environment.GetFolderPath(SpecialFolder.LocalApplicationData) -
            // ta druga poziva SHGetKnownFolderPath, koji je uživo pucao kad je
            // ovaj proces bio pokretan preko ručno sastavljenog tokena bez
            // učitanog korisničkog registry hive-a (stari SessionLauncher.cs
            // pristup, sad uklonjen). Scheduled Task "at logon" bi trebalo da
            // ima potpuno normalan, učitan profil, ali env-var pristup je i
            // dalje bezbedniji/dokazan izbor - nema razloga menjati ga.
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
            // Dijagnostički režim bez signaling/ICE/enkodera - samo
            // Initialize()+jedan frejm, pa izlaz. Koristi se da se jeftino
            // proveri da li DXGI/GDI capture uopšte radi u trenutnom launch
            // kontekstu, bez potrebe da se prođe kroz punu signaling/mailbox
            // infrastrukturu.
            if (args.Length == 1 && args[0] == "--test-capture")
            {
                Log("--test-capture rezim - inicijalizujem capture, jedan frejm, bez signaling-a.");
                var result = WebRtcSession.TestCaptureOnce();
                Log("--test-capture rezultat: " + result);
                return 0;
            }

            // Kompatibilnost sa direktnim ručnim pokretanjem (npr. PsExec
            // testiranje tokom dijagnostike) - ako su data 4 argumenta,
            // odradi TAČNO jednu sesiju pa izađi, isto ponašanje kao pre ove
            // izmene. Normalan Scheduled-Task slučaj se pokreće bez argumenata
            // i ulazi u trajnu petlju ispod.
            if (args.Length >= 4)
            {
                return RunOneSession(args[0], args[1], args[2], args[3]);
            }

            return RunPersistentLoop();
        }

        /// <summary>
        /// Trajna petlja - proces se pokreće JEDNOM po korisničkom logon-u
        /// (Scheduled Task), pa čeka na WebRtcBridgeCommand mailbox poruke
        /// (jedna po WebRTC sesiji) umesto da dobija argumente preko argv i
        /// izlazi posle jedne sesije. Ne vraća se dok proces ne bude ubijen
        /// (logoff, update koji ubija proces preko KillProcessNames, itd).
        /// </summary>
        private static int RunPersistentLoop()
        {
            Log("WebRtcBridge helper pokrenut (trajni mod) - čekam komande iz mailbox-a.");

            Directory.CreateDirectory(Paths.WebRtcMailboxDir);

            using (var mailboxSignal = new AutoResetEvent(false))
            {
                FileSystemWatcher watcher = null;
                try
                {
                    watcher = new FileSystemWatcher(Paths.WebRtcMailboxDir, "*.json")
                    {
                        NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
                    };
                    watcher.Created += (s, e) => mailboxSignal.Set();
                    watcher.Renamed += (s, e) => mailboxSignal.Set();
                    watcher.EnableRaisingEvents = true;
                }
                catch (Exception ex)
                {
                    // Best-effort - bez watcher-a i dalje radi preko poll
                    // fallback-a ispod, samo sa malo većim kašnjenjem.
                    FileLogger.Warn("FileSystemWatcher na " + Paths.WebRtcMailboxDir + " nije uspeo: " + ex.Message);
                }

                try
                {
                    while (true)
                    {
                        mailboxSignal.WaitOne(MailboxPollFallbackMs);

                        WebRtcBridgeCommand command;
                        try
                        {
                            command = TryDequeueForActiveSession();
                        }
                        catch (Exception ex)
                        {
                            FileLogger.Error("Čitanje WebRtcBridgeCommand mailbox-a nije uspelo", ex);
                            continue;
                        }

                        if (command == null) continue;

                        Log("Nova WebRTC sesija iz mailbox-a: sessionId=" + command.SessionId);
                        RunOneSession(command.ServerBaseUrl, command.SessionId, command.AgentId, command.ApiKey);
                        Log("WebRTC sesija završena, vraćam se na čekanje sledeće komande.");
                    }
                }
                finally
                {
                    watcher?.Dispose();
                }
            }
        }

        /// <summary>
        /// Proverava da li JE OVAJ proces trenutno u aktivnoj konzolnoj
        /// sesiji PRE nego što uopšte dotakne mailbox fajl - na mašini sa
        /// više istovremenih interaktivnih sesija (RDS/fast user switching,
        /// redak slučaj za ovaj RMM, ali mogući) svaki ulogovani korisnik ima
        /// SVOJ helper, i svi vide ISTI mailbox fajl/folder. Samo onaj čija
        /// sesija je TRENUTNO aktivna konzolna sesija sme da pročita/obriše
        /// komandu - ostali je ostavljaju netaknutu za pravog primaoca.
        /// </summary>
        private static WebRtcBridgeCommand TryDequeueForActiveSession()
        {
            var activeSessionId = WTSGetActiveConsoleSessionId();
            if (activeSessionId == uint.MaxValue || activeSessionId != (uint)Process.GetCurrentProcess().SessionId)
            {
                return null;
            }

            var path = Paths.WebRtcBridgeCommandFile;
            if (!File.Exists(path)) return null;

            string json;
            try
            {
                json = File.ReadAllText(path);
                // Briši ODMAH po čitanju (pre deserializacije/obrade) - isti
                // delete-before-execute obrazac kao ManagerWorker.Dequeue,
                // sprečava duplu obradu ako i signal i poll fallback stignu
                // skoro istovremeno.
                File.Delete(path);
            }
            catch (IOException)
            {
                // Fajl je verovatno usred pisanja (tmp->final rename nije
                // atomičan sa gledišta FileSystemWatcher-ovog Created eventa
                // koji može stići pre nego što je Move završen) - preskoči
                // ovaj ciklus, sledeći poll/signal će ga pokupiti.
                return null;
            }

            return JsonConvert.DeserializeObject<WebRtcBridgeCommand>(json);
        }

        /// <summary>
        /// Ceo per-sesijski WebRTC tok (signaling WS, SDP offer/answer, ICE,
        /// capture/encode, blokira do kraja sesije) - identično onome što je
        /// pre ove izmene bilo CELO RunMain telo, sad izdvojeno u metodu da
        /// bi moglo da se pozove više puta (jednom po mailbox komandi) iz
        /// RunPersistentLoop, umesto tačno jednom pa exit.
        /// </summary>
        private static int RunOneSession(string serverBaseUrl, string sessionId, string agentId, string apiKey)
        {
            _stopSignal = new ManualResetEventSlim(false);

            Log("WebRtcBridge sesija pokrenuta. sessionId=" + sessionId + " agentId=" + agentId);

            // NAMERNA konverzija https/http -> wss/ws, isti obrazac kao
            // VncBridge.cs's BuildWsUrl (RFB put) - serverBaseUrl dolazi iz
            // config.json kao "https://host:port" (isti string koji
            // NetdeskApiClient koristi za obične HTTP pozive), ali
            // websocket-sharp-ov WebSocket konstruktor zahteva ws/wss šemu i
            // baca ArgumentException na bilo šta drugo.
            var wsUrl = serverBaseUrl.Replace("https://", "wss://").Replace("http://", "ws://")
                + $"/api/agents/webrtc-signaling?sessionId={sessionId}&agentId={Uri.EscapeDataString(agentId)}&apiKey={Uri.EscapeDataString(apiKey)}";

            _ws = new WebSocket(wsUrl);
            if (wsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
            {
                // Ista TLS 1.2 napomena kao NetdeskApiClient.cs/VncBridge.cs -
                // .NET Framework ne uključuje je po default-u.
                _ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
            }
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
            try
            {
                _ws.Connect();
            }
            catch (Exception ex)
            {
                FileLogger.Error("Signaling WS konekcija neuspešna (izuzetak iz Connect())", ex);
                return 1;
            }

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
                Log("WebRtcSession konstrukcija neuspešna: " + ex);
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                return 1;
            }

            _session.OnDiagnostic += msg => Log(msg);
            _session.OnIceCandidateGenerated += candidate =>
            {
                // SIPSorcery-ov RTCIceCandidate.candidate je bukvalno alias za
                // ToString() - vraća samo sirovu SDP atributsku vrednost, BEZ
                // vodećeg "candidate:" tokena. W3C RTCIceCandidateInit.candidate
                // zahteva taj token.
                var candidateString = "candidate:" + candidate.candidate;
                Log("ICE kandidat generisan (" + candidateString + ") - šaljem signaling.");
                SendSignalingMessage(new JObject
                {
                    ["type"] = "ice",
                    ["candidate"] = candidateString,
                    ["sdpMid"] = candidate.sdpMid,
                    ["sdpMLineIndex"] = candidate.sdpMLineIndex,
                });
            };
            _session.OnConnectionFailed += () =>
            {
                Log("WebRTC konekcija neuspešna (ICE failed/closed) - javljam 'failed' i gasim se.");
                SendSignalingMessage(new JObject { ["type"] = "failed" });
                _stopSignal.Set();
            };

            StartOfferHandshake();

            // Blokira dok se sesija ne završi (fallback, viewer prekine,
            // WS se zatvori) - NE gasi ceo proces više, samo ovu jednu
            // sesiju; RunPersistentLoop se vraća na čekanje sledeće komande.
            _stopSignal.Wait();

            _session.Dispose();
            if (_ws.IsAlive) _ws.Close();
            return 0;
        }

        /// <summary>
        /// Loguje lokalno (best-effort, FileLogger) I preko signaling WS-a
        /// kao {"type":"log"} poruka - backend (persistMessage u
        /// ws/webrtcSignaling.js) snima SVAKU signaling poruku u
        /// vnc_webrtc_signaling tabelu BEZUSLOVNO, pre bilo kakvog grananja po
        /// tipu, pa je ovo u praksi pouzdaniji dijagnostički kanal od bilo
        /// čega na samoj klijentskoj mašini. Viewer strana (frontend)
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
