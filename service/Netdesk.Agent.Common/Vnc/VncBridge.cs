using System;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Authentication;
using System.Threading;
using System.Threading.Tasks;
using WebSocketSharp;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// A thin TCP&lt;-&gt;WebSocket "byte forwarder" - connects to the local
    /// UltraVNC server (127.0.0.1:VncLocalPort) and to the backend relay over
    /// WebSocket, then just forwards raw bytes in both directions. It doesn't
    /// parse, decode, or touch a single byte of the actual RFB protocol
    /// - UltraVNC (server side) and noVNC (browser side) do that. Unlike
    /// the old VncStreamer/ScreenCaptureService/InputInjector
    /// trio, there's no GDI, SendInput or WTS/Session 0 logic here -
    /// a plain loopback TCP connection works identically in Session 0 (LocalSystem)
    /// as in any other session, because it isn't a desktop/GDI resource.
    ///
    /// Uses WebSocketSharp (not System.Net.WebSockets.ClientWebSocket) -
    /// discovered live on Windows 7: ClientWebSocket throws
    /// PlatformNotSupportedException there because it depends on the WinHTTP WebSocket
    /// API, which doesn't exist before Windows 8. websocket-sharp implements
    /// RFC 6455 itself, over raw sockets, without that OS dependency - and
    /// Windows 7 support is exactly why this project targets net452.
    ///
    /// This library has no public API for arbitrary custom request headers
    /// (no e.g. CustomHeaders property), so the agent-side auth
    /// (agentId/apiKey) is sent as a query string, just as the viewer side
    /// (the browser WebSocket API) already has to send the JWT as a query param instead of a
    /// header - the same pattern, the same reason (a WS client that doesn't allow
    /// custom headers), and the same security context (this is a server.on("upgrade")
    /// route, it doesn't go through the Express/morgan access log).
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
                    // Nagle's algorithm is on by default and batches small
                    // writes for up to ~40ms - wrong for a relay carrying
                    // individual RFB messages (mouse moves, small incremental
                    // screen updates). Loopback RTT is near-zero anyway, so
                    // there's no bandwidth-efficiency tradeoff to weigh here.
                    tcp.NoDelay = true;
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
                        // The same TLS 1.2 note as NetdeskApiClient.cs - .NET
                        // Framework 4.5.2 doesn't enable it by default.
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

                    DisableNagleOnWebSocketSocket(ws, sessionId);

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
                        /* best effort - the server has probably already closed the connection */
                    }

                    FileLogger.Info("VNC sesija #" + sessionId + " - most zatvoren.");
                }
            }
        }

        // Runs on its own background thread (Task.Run) - websocket-sharp
        // has no async ReceiveAsync-style API like ClientWebSocket, so
        // the incoming side (UltraVNC -> WS) is handled via the OnMessage event
        // (which websocket-sharp fires itself on its internal thread after
        // Connect()), and this loop covers only the TCP -> WS direction.
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
                    break; // UltraVNC closed the connection
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

        // websocket-sharp has a public API only for sending/receiving messages, not
        // for configuring the socket underneath - there's no "NoDelay"-type property nor
        // a way to pass an already configured TcpClient into the constructor. Without
        // this, Nagle's algorithm (enabled by default, it batches small
        // writes for up to ~40ms) still applies on exactly this leg - the agent -> backend
        // WebSocket connection that carries incremental screen updates
        // (most of the traffic) - even though NoDelay is already set on the
        // local TCP to UltraVNC (above) and on both ends of the backend relay
        // (vncRelay.js). Reflection on the private "_tcpClient" field is the only
        // way to close that gap without replacing the whole WS library (websocket-sharp
        // was chosen precisely for Windows 7 support - see the note at the top of the
        // file). Deliberately best-effort: if the field ever changes/disappears in
        // a future version of the package, this just silently fails (the VNC bridge still works
        // correctly, just without this extra tweak) - it must not bring down the
        // session because of one optimization.
        private static void DisableNagleOnWebSocketSocket(WebSocket ws, long sessionId)
        {
            try
            {
                var field = typeof(WebSocket).GetField("_tcpClient", BindingFlags.NonPublic | BindingFlags.Instance);
                var tcpClient = field?.GetValue(ws) as TcpClient;
                if (tcpClient != null)
                {
                    tcpClient.NoDelay = true;
                }
                else
                {
                    FileLogger.Warn(
                        "VNC sesija #" + sessionId + " - _tcpClient polje nije pronađeno na WebSocket instanci " +
                        "(verovatno promenjena verzija websocket-sharp) - Nagle ostaje uključen na agent->backend grani.");
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn(
                    "VNC sesija #" + sessionId + " - podešavanje NoDelay na WebSocket soketu neuspešno (nekritično): " + ex.Message);
            }
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
