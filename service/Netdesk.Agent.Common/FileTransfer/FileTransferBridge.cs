using System;
using System.IO;
using System.Security.Authentication;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using WebSocketSharp;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.FileTransfer
{
    /// <summary>
    /// AnyDesk-style file transfer during a VNC session (copy from the remote
    /// machine / upload to it) - a channel separate from VncBridge.cs, since the RFB/
    /// VNC protocol has no concept of a file (ClientCutText/ServerCutText are
    /// text-only). Unlike VncBridge (blind TCP&lt;-&gt;WS byte pumping),
    /// this class ACTUALLY parses messages - it receives JSON commands over WS and
    /// answers by reading/writing files locally, because there's no local UltraVNC
    /// equivalent that would do it instead.
    ///
    /// Runs directly in the Netdesk.Agent.Service (LocalSystem, Session 0) process,
    /// WITHOUT needing an interactive user session - unlike
    /// DXGI capture/SendInput (the old WebRTC attempt, removed), plain
    /// reading/writing of files on disk doesn't require access to the interactive
    /// desktop, LocalSystem has full access to the file system.
    ///
    /// Deliberately ONE transfer (download OR upload) at a time per session - the same
    /// simplification as backend/ws/fileTransferRelay.js's
    /// streamDownloadToResponse (an internal RMM tool, low real concurrent
    /// access for one admin looking at one agent).
    /// </summary>
    public sealed class FileTransferBridge
    {
        private const int ChunkSize = 65536; // 64KB
        private const long MaxFileSizeBytes = 750L * 1024 * 1024; // 750MB - see the note at Download/HandleUploadStart

        private long _sessionId;
        private WebSocket _ws;
        private UploadState _pendingUpload;

        public static Task RunAsync(
            long sessionId, string serverBaseUrl, string agentId, string apiKey, CancellationToken token)
        {
            var bridge = new FileTransferBridge();
            return bridge.RunInstanceAsync(sessionId, serverBaseUrl, agentId, apiKey, token);
        }

        private async Task RunInstanceAsync(
            long sessionId, string serverBaseUrl, string agentId, string apiKey, CancellationToken token)
        {
            _sessionId = sessionId;
            var wsUrl = BuildWsUrl(serverBaseUrl, sessionId, agentId, apiKey);

            using (var ws = new WebSocket(wsUrl))
            {
                _ws = ws;
                if (wsUrl.StartsWith("wss://", StringComparison.OrdinalIgnoreCase))
                {
                    // The same TLS 1.2 note as VncBridge.cs/NetdeskApiClient.cs -
                    // .NET Framework 4.5.2 doesn't enable it by default.
                    ws.SslConfiguration.EnabledSslProtocols = SslProtocols.Tls12;
                }

                var closedSignal = new TaskCompletionSource<bool>();

                ws.OnMessage += (sender, e) =>
                {
                    try
                    {
                        if (e.IsBinary)
                        {
                            HandleUploadChunk(e.RawData);
                        }
                        else if (e.IsText)
                        {
                            HandleTextMessage(e.Data);
                        }
                    }
                    catch (Exception ex)
                    {
                        FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - obrada poruke neuspešna", ex);
                    }
                };
                ws.OnError += (sender, e) =>
                {
                    FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - WebSocket greška: " + e.Message, e.Exception);
                    closedSignal.TrySetResult(true);
                };
                ws.OnClose += (sender, e) => closedSignal.TrySetResult(true);

                try
                {
                    ws.Connect();
                }
                catch (Exception ex)
                {
                    FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - WebSocket konekcija neuspešna", ex);
                    return;
                }

                if (ws.ReadyState != WebSocketState.Open)
                {
                    FileLogger.Error(
                        "Fajl-transfer sesija #" + _sessionId + " - WebSocket konekcija neuspešna (state=" + ws.ReadyState + ")");
                    return;
                }

                FileLogger.Info("Fajl-transfer sesija #" + _sessionId + " - konekcija uspostavljena.");

                var cancelSignal = new TaskCompletionSource<bool>();
                using (token.Register(() => cancelSignal.TrySetResult(true)))
                {
                    await Task.WhenAny(closedSignal.Task, cancelSignal.Task).ConfigureAwait(false);
                }

                AbortPendingUpload("sesija zatvorena");

                try
                {
                    if (ws.ReadyState == WebSocketState.Open) ws.Close(CloseStatusCode.Normal);
                }
                catch
                {
                    /* best effort - the server has probably already closed the connection */
                }

                FileLogger.Info("Fajl-transfer sesija #" + _sessionId + " - konekcija zatvorena.");
            }
        }

        private void HandleTextMessage(string json)
        {
            JObject msg;
            try
            {
                msg = JObject.Parse(json);
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Fajl-transfer sesija #" + _sessionId + " - neispravna JSON poruka: " + ex.Message);
                return;
            }

            var type = (string)msg["type"];
            switch (type)
            {
                case "list":
                    HandleList((string)msg["path"]);
                    break;
                case "download":
                    HandleDownload((string)msg["path"], (string)msg["requestId"]);
                    break;
                case "upload_start":
                    HandleUploadStart(msg);
                    break;
                case "upload_end":
                    HandleUploadEnd((string)msg["requestId"]);
                    break;
                default:
                    FileLogger.Warn("Fajl-transfer sesija #" + _sessionId + " - nepoznat tip poruke: " + type);
                    break;
            }
        }

        private void Send(JObject message)
        {
            try
            {
                _ws.Send(message.ToString(Newtonsoft.Json.Formatting.None));
            }
            catch (Exception ex)
            {
                FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - slanje poruke neuspešno", ex);
            }
        }

        // An empty/null path = list the available drives (DriveInfo), not the
        // contents of the current directory - the browser side starts an "empty"
        // navigation from the root, not from the agent's cwd, which means nothing
        // to the user.
        private void HandleList(string path)
        {
            try
            {
                var entries = new JArray();

                if (string.IsNullOrEmpty(path))
                {
                    foreach (var drive in DriveInfo.GetDrives())
                    {
                        if (!drive.IsReady) continue;
                        entries.Add(new JObject
                        {
                            ["name"] = drive.Name,
                            ["isDirectory"] = true,
                            ["size"] = 0,
                            ["modifiedAt"] = null,
                        });
                    }
                    Send(new JObject { ["type"] = "list_result", ["path"] = "", ["entries"] = entries, ["error"] = null });
                    return;
                }

                var fullPath = Path.GetFullPath(path);
                var dir = new DirectoryInfo(fullPath);
                if (!dir.Exists)
                {
                    Send(new JObject { ["type"] = "list_result", ["path"] = path, ["entries"] = null, ["error"] = "Direktorijum ne postoji." });
                    return;
                }

                foreach (var sub in dir.GetDirectories())
                {
                    entries.Add(new JObject
                    {
                        ["name"] = sub.Name,
                        ["isDirectory"] = true,
                        ["size"] = 0,
                        ["modifiedAt"] = sub.LastWriteTimeUtc.ToString("o"),
                    });
                }
                foreach (var file in dir.GetFiles())
                {
                    entries.Add(new JObject
                    {
                        ["name"] = file.Name,
                        ["isDirectory"] = false,
                        ["size"] = file.Length,
                        ["modifiedAt"] = file.LastWriteTimeUtc.ToString("o"),
                    });
                }

                Send(new JObject { ["type"] = "list_result", ["path"] = fullPath, ["entries"] = entries, ["error"] = null });
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Fajl-transfer sesija #" + _sessionId + " - listanje '" + path + "' neuspešno: " + ex.Message);
                Send(new JObject { ["type"] = "list_result", ["path"] = path, ["entries"] = null, ["error"] = ex.Message });
            }
        }

        private void HandleDownload(string path, string requestId)
        {
            try
            {
                var fullPath = Path.GetFullPath(path);
                var file = new FileInfo(fullPath);
                if (!file.Exists)
                {
                    Send(new JObject { ["type"] = "download_error", ["requestId"] = requestId, ["error"] = "Fajl ne postoji." });
                    return;
                }
                if (file.Length > MaxFileSizeBytes)
                {
                    Send(new JObject
                    {
                        ["type"] = "download_error",
                        ["requestId"] = requestId,
                        ["error"] = "Fajl je prevelik za preuzimanje preko ovog kanala (limit " + (MaxFileSizeBytes / (1024 * 1024)) + "MB).",
                    });
                    return;
                }

                Send(new JObject
                {
                    ["type"] = "download_start",
                    ["requestId"] = requestId,
                    ["fileName"] = file.Name,
                    ["size"] = file.Length,
                });

                using (var stream = file.OpenRead())
                {
                    var buffer = new byte[ChunkSize];
                    int read;
                    while ((read = stream.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        var chunk = read == buffer.Length ? buffer : SubArray(buffer, read);
                        _ws.Send(chunk);
                    }
                }

                Send(new JObject { ["type"] = "download_end", ["requestId"] = requestId });
            }
            catch (Exception ex)
            {
                FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - preuzimanje '" + path + "' neuspešno", ex);
                Send(new JObject { ["type"] = "download_error", ["requestId"] = requestId, ["error"] = ex.Message });
            }
        }

        private static byte[] SubArray(byte[] source, int length)
        {
            var result = new byte[length];
            Array.Copy(source, result, length);
            return result;
        }

        // Writes to "<path>.part" while in progress, renames to the final path ONLY
        // once the number of received bytes reaches the announced size (see
        // HandleUploadChunk) - a half-done/interrupted transfer never remains
        // under the final file name.
        private void HandleUploadStart(JObject msg)
        {
            var requestId = (string)msg["requestId"];
            var path = (string)msg["path"];
            var size = msg["size"]?.Value<long>() ?? -1;

            if (_pendingUpload != null)
            {
                Send(new JObject { ["type"] = "upload_result", ["requestId"] = requestId, ["success"] = false, ["error"] = "Drugi upload je već u toku." });
                return;
            }
            if (size < 0 || size > MaxFileSizeBytes)
            {
                Send(new JObject
                {
                    ["type"] = "upload_result",
                    ["requestId"] = requestId,
                    ["success"] = false,
                    ["error"] = "Neispravna ili prevelika veličina fajla (limit " + (MaxFileSizeBytes / (1024 * 1024)) + "MB).",
                });
                return;
            }

            string fullPath;
            string partPath;
            FileStream stream;
            try
            {
                fullPath = Path.GetFullPath(path);
                partPath = fullPath + ".part";
                stream = new FileStream(partPath, FileMode.Create, FileAccess.Write, FileShare.None);
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Fajl-transfer sesija #" + _sessionId + " - otvaranje '" + path + "' za upis neuspešno: " + ex.Message);
                Send(new JObject { ["type"] = "upload_result", ["requestId"] = requestId, ["success"] = false, ["error"] = ex.Message });
                return;
            }

            _pendingUpload = new UploadState
            {
                RequestId = requestId,
                TargetPath = fullPath,
                PartPath = partPath,
                ExpectedSize = size,
                ReceivedBytes = 0,
                Stream = stream,
            };
        }

        private void HandleUploadChunk(byte[] data)
        {
            var upload = _pendingUpload;
            if (upload == null) return; // binary frame without an active upload - ignore

            try
            {
                upload.Stream.Write(data, 0, data.Length);
                upload.ReceivedBytes += data.Length;

                if (upload.ReceivedBytes >= upload.ExpectedSize)
                {
                    FinalizeUpload(upload, success: true, error: null);
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - upis upload chunk-a neuspešan", ex);
                FinalizeUpload(upload, success: false, error: ex.Message);
            }
        }

        // "upload_end" is an informational confirmation from the browser side - the actual
        // finalization happens as soon as the number of received bytes reaches the
        // announced size (HandleUploadChunk), since WS ordering is
        // guaranteed (no reordering on a single connection). If "upload_end"
        // arrives while the upload is still incomplete (the browser stopped early),
        // it's treated as a failure - deletes the ".part" instead of leaving a half-done
        // file.
        private void HandleUploadEnd(string requestId)
        {
            var upload = _pendingUpload;
            if (upload == null || upload.RequestId != requestId) return;
            if (upload.ReceivedBytes < upload.ExpectedSize)
            {
                FinalizeUpload(upload, success: false, error: "Prenos prekinut pre kraja.");
            }
        }

        private void FinalizeUpload(UploadState upload, bool success, string error)
        {
            _pendingUpload = null;
            try
            {
                upload.Stream.Close();
            }
            catch
            {
                /* best effort */
            }

            if (success)
            {
                try
                {
                    if (File.Exists(upload.TargetPath)) File.Delete(upload.TargetPath);
                    File.Move(upload.PartPath, upload.TargetPath);
                }
                catch (Exception ex)
                {
                    FileLogger.Error("Fajl-transfer sesija #" + _sessionId + " - preimenovanje '" + upload.PartPath + "' neuspešno", ex);
                    TryDeletePartFile(upload.PartPath);
                    Send(new JObject { ["type"] = "upload_result", ["requestId"] = upload.RequestId, ["success"] = false, ["error"] = ex.Message });
                    return;
                }
                Send(new JObject { ["type"] = "upload_result", ["requestId"] = upload.RequestId, ["success"] = true });
            }
            else
            {
                TryDeletePartFile(upload.PartPath);
                Send(new JObject { ["type"] = "upload_result", ["requestId"] = upload.RequestId, ["success"] = false, ["error"] = error });
            }
        }

        private void AbortPendingUpload(string reason)
        {
            var upload = _pendingUpload;
            if (upload == null) return;
            _pendingUpload = null;
            try { upload.Stream.Close(); } catch { /* best effort */ }
            TryDeletePartFile(upload.PartPath);
            FileLogger.Warn("Fajl-transfer sesija #" + _sessionId + " - upload prekinut (" + reason + "), '.part' fajl obrisan.");
        }

        private static void TryDeletePartFile(string partPath)
        {
            try
            {
                if (File.Exists(partPath)) File.Delete(partPath);
            }
            catch
            {
                /* best effort */
            }
        }

        private static string BuildWsUrl(string serverBaseUrl, long sessionId, string agentId, string apiKey)
        {
            var wsBase = serverBaseUrl.Replace("https://", "wss://").Replace("http://", "ws://");
            return wsBase + "/api/agents/file-transfer?sessionId=" + sessionId +
                   "&agentId=" + Uri.EscapeDataString(agentId) +
                   "&apiKey=" + Uri.EscapeDataString(apiKey);
        }

        private sealed class UploadState
        {
            public string RequestId;
            public string TargetPath;
            public string PartPath;
            public long ExpectedSize;
            public long ReceivedBytes;
            public FileStream Stream;
        }
    }
}
