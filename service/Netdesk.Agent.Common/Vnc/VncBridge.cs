using System;
using System.Net;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Threading;
using System.Threading.Tasks;
using WebSocketSharp;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// Tanak TCP&lt;-&gt;WebSocket "byte forwarder" - povezuje se na lokalni
    /// UltraVNC server (127.0.0.1:VncLocalPort) i na backend relay preko
    /// WebSocket-a, pa samo prosleđuje sirove bajtove u oba smera. Ne
    /// parsira, ne dekoduje, ne dodiruje ni jedan bajt pravog RFB protokola
    /// - to rade UltraVNC (server strana) i noVNC (browser strana). Za
    /// razliku od stare VncStreamer/ScreenCaptureService/InputInjector
    /// trojke, ovde nema GDI-ja, SendInput-a ni WTS/Session 0 logike -
    /// obična loopback TCP konekcija radi identično u Session 0 (LocalSystem)
    /// kao u bilo kojoj drugoj sesiji, jer nije desktop/GDI resurs.
    ///
    /// Koristi WebSocketSharp (ne System.Net.WebSockets.ClientWebSocket) -
    /// otkriveno uživo na Windows 7: ClientWebSocket baca
    /// PlatformNotSupportedException tamo jer zavisi od WinHTTP WebSocket
    /// API-ja koji ne postoji pre Windows 8. websocket-sharp implementira
    /// RFB 6455 sam, nad sirovim soketima, bez te OS zavisnosti - a upravo
    /// Windows 7 podrška je razlog zašto ovaj projekat cilja net452.
    ///
    /// Ova biblioteka nema javni API za proizvoljne custom request header-e
    /// (nema npr. CustomHeaders svojstvo), pa se agent-side auth
    /// (agentId/apiKey) šalje kao query string, isto kao što viewer-side
    /// (browser WebSocket API) već mora da šalje JWT kao query param umesto
    /// header-a - isti obrazac, isti razlog (WS klijent koji ne dozvoljava
    /// custom header-e), i isti sigurnosni kontekst (ovo je server.on("upgrade")
    /// ruta, ne prolazi kroz Express/morgan access log).
    /// </summary>
    public static class VncBridge
    {
        private const int BufferSize = 8192;

        public static async Task RunAsync(
            long sessionId,
            string serverBaseUrl,
            string agentId,
            string apiKey,
            int localVncPort,
            CancellationToken token)
        {
            using (var tcp = new TcpClient())
            {
                try
                {
                    await tcp.ConnectAsync(IPAddress.Loopback, localVncPort).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    FileLogger.Error(
                        "VNC sesija #" + sessionId + " - konekcija na lokalni UltraVNC (127.0.0.1:" +
                        localVncPort + ") neuspešna. Da li je UltraVNC servis pokrenut?",
                        ex);
                    return;
                }

                var stream = tcp.GetStream();
                var wsUrl = BuildWsUrl(serverBaseUrl, sessionId, agentId, apiKey);

                using (var ws = new WebSocket(wsUrl))
                {
                    if (wsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
                    {
                        // Ista TLS 1.2 napomena kao NetdeskApiClient.cs - .NET
                        // Framework 4.5.2 ne uključuje je po default-u.
                        ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
                    }

                    var closedSignal = new TaskCompletionSource<bool>();

                    ws.OnMessage += (sender, e) =>
                    {
                        if (!e.IsBinary) return;
                        try
                        {
                            stream.Write(e.RawData, 0, e.RawData.Length);
                        }
                        catch (Exception ex)
                        {
                            FileLogger.Error("VNC sesija #" + sessionId + " - pisanje ka lokalnom VNC-u neuspešno", ex);
                            closedSignal.TrySetResult(true);
                        }
                    };
                    ws.OnError += (sender, e) =>
                    {
                        FileLogger.Error("VNC sesija #" + sessionId + " - WebSocket greška: " + e.Message, e.Exception);
                        closedSignal.TrySetResult(true);
                    };
                    ws.OnClose += (sender, e) => closedSignal.TrySetResult(true);

                    try
                    {
                        ws.Connect();
                    }
                    catch (Exception ex)
                    {
                        FileLogger.Error("VNC sesija #" + sessionId + " - WebSocket konekcija neuspešna", ex);
                        return;
                    }

                    if (ws.ReadyState != WebSocketState.Open)
                    {
                        FileLogger.Error(
                            "VNC sesija #" + sessionId + " - WebSocket konekcija neuspešna (state=" + ws.ReadyState + ")");
                        return;
                    }

                    FileLogger.Info("VNC sesija #" + sessionId + " - most uspostavljen (TCP<->WebSocket).");

                    var cancelSignal = new TaskCompletionSource<bool>();
                    using (token.Register(() => cancelSignal.TrySetResult(true)))
                    {
                        var tcpToWsTask = Task.Run(() => PumpTcpToWebSocket(stream, ws, sessionId, token, closedSignal));

                        await Task.WhenAny(closedSignal.Task, cancelSignal.Task, tcpToWsTask).ConfigureAwait(false);

                        try { stream.Close(); } catch { /* unblocks a pending synchronous Read */ }
                        try { await tcpToWsTask.ConfigureAwait(false); } catch { /* expected after stream.Close() */ }
                    }

                    try
                    {
                        if (ws.ReadyState == WebSocketState.Open)
                        {
                            ws.Close(CloseStatusCode.Normal);
                        }
                    }
                    catch
                    {
                        /* best effort - server je verovatno već zatvorio vezu */
                    }

                    FileLogger.Info("VNC sesija #" + sessionId + " - most zatvoren.");
                }
            }
        }

        // Radi na sopstvenoj pozadinskoj niti (Task.Run) - websocket-sharp
        // nema async ReceiveAsync-stil API kao ClientWebSocket, pa se
        // dolazna strana (UltraVNC -> WS) obrađuje preko OnMessage eventa
        // (koji websocket-sharp sam pokreće na svojoj internoj niti posle
        // Connect()-a), a ova petlja pokriva samo TCP -> WS smer.
        private static void PumpTcpToWebSocket(
            System.Net.Sockets.NetworkStream stream, WebSocket ws, long sessionId,
            CancellationToken token, TaskCompletionSource<bool> closedSignal)
        {
            var buffer = new byte[BufferSize];

            while (!token.IsCancellationRequested)
            {
                int read;
                try
                {
                    read = stream.Read(buffer, 0, buffer.Length);
                }
                catch (Exception ex)
                {
                    if (!token.IsCancellationRequested)
                    {
                        FileLogger.Error("VNC sesija #" + sessionId + " - čitanje sa lokalnog VNC-a neuspešno", ex);
                    }
                    break;
                }

                if (read == 0)
                {
                    break; // UltraVNC je zatvorio konekciju
                }

                try
                {
                    var chunk = new byte[read];
                    Array.Copy(buffer, chunk, read);
                    ws.Send(chunk);
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - slanje ka WebSocket-u neuspešno", ex);
                    break;
                }
            }

            closedSignal.TrySetResult(true);
        }

        private static string BuildWsUrl(string serverBaseUrl, long sessionId, string agentId, string apiKey)
        {
            var wsBase = serverBaseUrl.Replace("https://", "wss://").Replace("http://", "ws://");
            return wsBase + "/api/agents/vnc-stream?sessionId=" + sessionId +
                   "&agentId=" + Uri.EscapeDataString(agentId) +
                   "&apiKey=" + Uri.EscapeDataString(apiKey);
        }
    }
}
