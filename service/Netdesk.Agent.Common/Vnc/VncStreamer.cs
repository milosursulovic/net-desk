using System;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// Otvara sopstvenu, trajnu WebSocket vezu ka backend-u (nezavisno od
    /// glavnog job-poll HTTP kanala) i istovremeno: (1) šalje snimke ekrana
    /// kao JPEG binary poruke, (2) prima JSON input evente i prosleđuje ih
    /// InputInjector-u. Pokreće se na Task.Run iz AgentWorker-a (isti
    /// obrazac kao NetdeskAgentService.OnStart - jedini postojeći presedan
    /// za pozadinski task u ovom agentu) da ne blokira glavnu poll petlju
    /// za celo trajanje sesije.
    /// </summary>
    public static class VncStreamer
    {
        private static readonly TimeSpan FrameInterval = TimeSpan.FromMilliseconds(350); // ~2-3 FPS cilj

        public static async Task RunAsync(
            long sessionId, string serverBaseUrl, string agentId, string apiKey, CancellationToken outerToken)
        {
            // Ista TLS 1.2 napomena kao NetdeskApiClient.cs - .NET Framework
            // 4.5.2 ne uključuje je po default-u.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            var wsUrl = BuildWsUrl(serverBaseUrl, sessionId);

            using (var ws = new ClientWebSocket())
            {
                ws.Options.SetRequestHeader("Authorization", "Bearer " + agentId + ":" + apiKey);

                try
                {
                    await ws.ConnectAsync(new Uri(wsUrl), outerToken).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - konekcija neuspešna", ex);
                    return;
                }

                FileLogger.Info("VNC sesija #" + sessionId + " - konekcija uspostavljena.");

                using (var linked = CancellationTokenSource.CreateLinkedTokenSource(outerToken))
                {
                    var sendTask = SendFramesLoop(ws, sessionId, linked.Token);
                    var receiveTask = ReceiveInputLoop(ws, sessionId, linked.Token);

                    await Task.WhenAny(sendTask, receiveTask).ConfigureAwait(false);
                    linked.Cancel(); // druga petlja možda i dalje čeka - zaustavi i nju

                    try
                    {
                        await Task.WhenAll(sendTask, receiveTask).ConfigureAwait(false);
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

                FileLogger.Info("VNC sesija #" + sessionId + " - završena.");
            }
        }

        private static async Task SendFramesLoop(ClientWebSocket ws, long sessionId, CancellationToken token)
        {
            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                try
                {
                    var jpeg = ScreenCaptureService.CaptureAsJpeg();
                    await ws.SendAsync(new ArraySegment<byte>(jpeg), WebSocketMessageType.Binary, true, token)
                        .ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - slanje frame-a neuspešno", ex);
                    return;
                }

                try
                {
                    await Task.Delay(FrameInterval, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
        }

        private static async Task ReceiveInputLoop(ClientWebSocket ws, long sessionId, CancellationToken token)
        {
            var buffer = new byte[4096];

            while (!token.IsCancellationRequested && ws.State == WebSocketState.Open)
            {
                string message;

                try
                {
                    using (var ms = new MemoryStream())
                    {
                        WebSocketReceiveResult result;
                        do
                        {
                            result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token).ConfigureAwait(false);
                            if (result.MessageType == WebSocketMessageType.Close)
                            {
                                return;
                            }

                            ms.Write(buffer, 0, result.Count);
                        }
                        while (!result.EndOfMessage);

                        message = Encoding.UTF8.GetString(ms.ToArray());
                    }
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (Exception ex)
                {
                    FileLogger.Error("VNC sesija #" + sessionId + " - prijem input eventa neuspešan", ex);
                    return;
                }

                HandleInputEvent(message);
            }
        }

        private static void HandleInputEvent(string json)
        {
            try
            {
                var obj = JObject.Parse(json);
                var type = (string)obj["type"];

                switch (type)
                {
                    case "mousemove":
                        InputInjector.MoveMouseAbsolute((double)obj["x"], (double)obj["y"]);
                        break;
                    case "mousedown":
                        InputInjector.MouseButtonEvent(ParseButton((string)obj["button"]), true);
                        break;
                    case "mouseup":
                        InputInjector.MouseButtonEvent(ParseButton((string)obj["button"]), false);
                        break;
                    case "wheel":
                        InputInjector.MouseWheel((int)obj["delta"]);
                        break;
                    case "keydown":
                        InputInjector.KeyEvent((ushort)(int)obj["vk"], true);
                        break;
                    case "keyup":
                        InputInjector.KeyEvent((ushort)(int)obj["vk"], false);
                        break;
                    default:
                        FileLogger.Warn("Nepoznat VNC input event tip: " + type);
                        break;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Neispravan VNC input event: " + json, ex);
            }
        }

        private static InputInjector.MouseButton ParseButton(string button)
        {
            switch (button)
            {
                case "right":
                    return InputInjector.MouseButton.Right;
                case "middle":
                    return InputInjector.MouseButton.Middle;
                default:
                    return InputInjector.MouseButton.Left;
            }
        }

        private static string BuildWsUrl(string serverBaseUrl, long sessionId)
        {
            var wsBase = serverBaseUrl.Replace("https://", "wss://").Replace("http://", "ws://");
            return wsBase + "/api/agents/vnc-stream?sessionId=" + sessionId;
        }
    }
}
