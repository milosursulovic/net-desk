using System;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
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
    /// Pokreće se na Task.Run iz AgentWorker-a (isti obrazac kao
    /// NetdeskAgentService.OnStart) da ne blokira glavnu poll petlju za
    /// celo trajanje sesije.
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
            // Ista TLS 1.2 napomena kao NetdeskApiClient.cs - .NET Framework
            // 4.5.2 ne uključuje je po default-u.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

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

                var wsUrl = BuildWsUrl(serverBaseUrl, sessionId);

                using (var ws = new ClientWebSocket())
                {
                    ws.Options.SetRequestHeader("Authorization", "Bearer " + agentId + ":" + apiKey);

                    try
                    {
                        await ws.ConnectAsync(new Uri(wsUrl), token).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        FileLogger.Error("VNC sesija #" + sessionId + " - WebSocket konekcija neuspešna", ex);
                        return;
                    }

                    FileLogger.Info("VNC sesija #" + sessionId + " - most uspostavljen (TCP<->WebSocket).");

                    using (var linked = CancellationTokenSource.CreateLinkedTokenSource(token))
                    {
                        var stream = tcp.GetStream();
                        var tcpToWs = PumpTcpToWebSocket(stream, ws, sessionId, linked.Token);
                        var wsToTcp = PumpWebSocketToTcp(ws, stream, sessionId, linked.Token);

                        await Task.WhenAny(tcpToWs, wsToTcp).ConfigureAwait(false);
                        linked.Cancel(); // druga petlja možda i dalje čeka - zaustavi i nju

                        try
                        {
                            await Task.WhenAll(tcpToWs, wsToTcp).ConfigureAwait(false);
                        }
                        catch
                        {
                            // Očekivano posle Cancel() iznad - ne treba dodatno logovanje.
                        }
                    }

                    try
                    {
                        if (ws.State == WebSocketState.Open)
                        {
                            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None)
                                .ConfigureAwait(false);
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

        private static async Task PumpTcpToWebSocket(
            NetworkStream stream, ClientWebSocket ws, long sessionId, CancellationToken token)
        {
            var buffer = new byte[BufferSize];

            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                int read;
                try
                {
                    read = await stream.ReadAsync(buffer, 0, buffer.Length, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - čitanje sa lokalnog VNC-a neuspešno", ex);
                    return;
                }

                if (read == 0)
                {
                    return; // UltraVNC je zatvorio konekciju
                }

                try
                {
                    await ws.SendAsync(new ArraySegment<byte>(buffer, 0, read), WebSocketMessageType.Binary, true, token)
                        .ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - slanje ka WebSocket-u neuspešno", ex);
                    return;
                }
            }
        }

        private static async Task PumpWebSocketToTcp(
            ClientWebSocket ws, NetworkStream stream, long sessionId, CancellationToken token)
        {
            var buffer = new byte[BufferSize];

            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result;
                try
                {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - prijem sa WebSocket-a neuspešan", ex);
                    return;
                }

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }

                // RFB je kontinuiran bajt-stream - EndOfMessage granice (WebSocket
                // frame boundary) su nebitne za sirov forwarding, prosleđujemo
                // šta god je primljeno u ovom pozivu bez čekanja na celu poruku.
                try
                {
                    await stream.WriteAsync(buffer, 0, result.Count, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - pisanje ka lokalnom VNC-u neuspešno", ex);
                    return;
                }
            }
        }

        private static string BuildWsUrl(string serverBaseUrl, long sessionId)
        {
            var wsBase = serverBaseUrl.Replace("https://", "wss://").Replace("http://", "ws://");
            return wsBase + "/api/agents/vnc-stream?sessionId=" + sessionId;
        }
    }
}
