import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import { findVncSessionById } from "../repositories/vncSessions.repo.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";

// Same 30-min hard cap as ws/vncRelay.js, same reason (a forgotten/
// abandoned session must not keep the channel open forever). A separate map/
// timer from vncRelay.js - the file-transfer channel has its own lifetime,
// it deliberately does NOT share a CancellationToken/socket with the VNC screen channel (see
// AgentWorker.cs) - closing one must not bring down the other.
const MAX_SESSION_MS = 30 * 60 * 1000;

// sessionId -> { agentSocket, viewerSocket, agentId, startedAt, timeoutHandle,
//                viewerRole, viewerUserId, viewerUsername, pendingDownload }
// pendingDownload (when present): { requestId, res }
const sessions = new Map();

// Same as ws/vncRelay.js's authenticateAgentSocket - deliberately duplicated
// rather than shared (the same reason ws/webrtcSignaling.js once had:
// each WS "upgrade" handler on server.on("upgrade") must parse its own
// URL/auth, there's no express middleware chain here).
async function authenticateAgentSocket(url) {
  const agentUid = url.searchParams.get("agentId");
  const apiKey = url.searchParams.get("apiKey");
  if (!agentUid || !apiKey) return null;

  const agent = await findAgentByUid(agentUid);
  if (!agent || agent.status !== "active") return null;

  const providedHash = Buffer.from(hashApiKey(apiKey), "hex");
  const storedHash = Buffer.from(agent.apiKeyHash, "hex");
  const isMatch =
    providedHash.length === storedHash.length &&
    crypto.timingSafeEqual(providedHash, storedHash);

  return isMatch ? agent : null;
}

// Same as ws/vncRelay.js's authenticateViewer - the same "admin"/"operator"
// threshold as viewing the screen (a plain "viewer" may not even view the VNC screen).
// Uploading files is STRICTER than this - see the check in the
// viewer ws.on("message") below, where exactly "admin" is additionally required.
function authenticateViewer(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin" && payload.role !== "operator") return null;
    return payload;
  } catch {
    return null;
  }
}

function closeSession(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);

  clearTimeout(session.timeoutHandle);
  if (session.pendingDownload) {
    try {
      if (!session.pendingDownload.res.headersSent) {
        session.pendingDownload.res.status(502).json({ message: "Fajl-transfer sesija prekinuta (" + reason + ")." });
      } else {
        session.pendingDownload.res.end();
      }
    } catch {
      /* best effort */
    }
  }
  try {
    session.agentSocket?.close();
  } catch {
    /* already closed */
  }
  try {
    session.viewerSocket?.close();
  } catch {
    /* already closed */
  }
}

function getOrCreateSession(sessionId, agentId) {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = { agentId, startedAt: Date.now(), pendingDownload: null };
    entry.timeoutHandle = setTimeout(() => closeSession(sessionId, "timeout"), MAX_SESSION_MS);
    sessions.set(sessionId, entry);
  }
  return entry;
}

/**
 * A third WS relay on the same HTTPS server as ws/vncRelay.js (same "upgrade"
 * event, same port/certificate) - a dedicated SEPARATE channel for AnyDesk-style
 * file transfer during a VNC session (copy a file from the remote machine /
 * upload a file to it), since the RFB/VNC protocol has no concept of a file.
 *
 *   - /api/agents/file-transfer?sessionId=N          (agent, outbound-initiated)
 *   - /api/protected/file-transfer/:sessionId?token=JWT  (admin browser)
 *
 * Mostly a blind bidirectional passthrough (like vncRelay.js) for "list"/
 * "upload_*" messages, WITH TWO deliberate exceptions:
 *   1) the viewer->agent "upload_start" message is let through ONLY if the
 *      viewer's JWT role is exactly "admin" (stricter than the "admin"/"operator" threshold
 *      for connect/list/download - writing an arbitrary file to a remote
 *      disk is a bigger blast radius than reading/viewing the screen).
 *   2) "download" (fetching from the remote machine) does NOT go over the viewer's
 *      WS at all - it's a hybrid path over a regular HTTP GET route
 *      (routes/agentsAdmin.routes.js), which calls streamDownloadToResponse
 *      below to forward the request to the agent and writes the incoming bytes DIRECTLY to the
 *      HTTP response - avoids Blob accumulation and OOM risk in the browser for
 *      large files, the browser side is a plain `<a href>` link.
 */
export function attachFileTransferRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "https://placeholder.invalid");
    } catch {
      // Deliberately no socket.destroy() - another "upgrade" handler on the same
      // server (vncRelay.js, webrtcSignaling.js previously) needs a chance to
      // handle paths this one doesn't recognize.
      return;
    }

    if (url.pathname === "/api/agents/file-transfer") {
      const agent = await authenticateAgentSocket(url);
      const sessionId = Number(url.searchParams.get("sessionId"));
      const session = sessionId ? await findVncSessionById(sessionId) : null;

      if (!agent || !session || session.agentId !== agent.id) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId, agent.id);
        entry.agentSocket = ws;

        ws.on("message", (data, isBinary) => {
          const current = sessions.get(sessionId);
          if (!current) return;

          // While a download is in progress, EVERYTHING arriving from the agent (JSON
          // download_start/download_end/download_error as text, raw
          // bytes as binary) goes to the HTTP response, NOT the viewer's WS -
          // the download doesn't go through the viewer socket at all (see the note at
          // the top of the file).
          if (current.pendingDownload) {
            if (isBinary) {
              try {
                current.pendingDownload.res.write(data);
              } catch (err) {
                console.error("Pisanje download chunk-a na HTTP response neuspešno", err);
              }
              return;
            }

            let msg = null;
            try {
              msg = JSON.parse(data.toString());
            } catch {
              /* not JSON - ignore, don't forward */
            }
            if (msg && msg.requestId === current.pendingDownload.requestId) {
              if (msg.type === "download_start") {
                try {
                  current.pendingDownload.res.writeHead(200, {
                    "Content-Type": "application/octet-stream",
                    "Content-Disposition":
                      "attachment; filename*=UTF-8''" + encodeURIComponent(msg.fileName || "fajl"),
                    ...(Number.isFinite(msg.size) ? { "Content-Length": String(msg.size) } : {}),
                  });
                } catch (err) {
                  console.error("writeHead za download neuspešan", err);
                }
                return;
              }
              if (msg.type === "download_end") {
                try {
                  current.pendingDownload.res.end();
                } catch {
                  /* best effort */
                }
                current.pendingDownload.resolve?.();
                current.pendingDownload = null;
                return;
              }
              if (msg.type === "download_error") {
                try {
                  if (!current.pendingDownload.res.headersSent) {
                    current.pendingDownload.res.status(404).json({ message: msg.error || "Fajl nije pronađen." });
                  } else {
                    current.pendingDownload.res.end();
                  }
                } catch {
                  /* best effort */
                }
                current.pendingDownload.reject?.(new Error(msg.error || "Preuzimanje neuspešno."));
                current.pendingDownload = null;
                return;
              }
            }
          }

          const viewer = current.viewerSocket;
          if (viewer?.readyState === WebSocket.OPEN) viewer.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "agent_disconnected"));
        ws.on("error", () => closeSession(sessionId, "agent_error"));
      });
      return;
    }

    const viewerMatch = url.pathname.match(/^\/api\/protected\/file-transfer\/(\d+)$/);
    if (viewerMatch) {
      const sessionId = Number(viewerMatch[1]);
      const token = url.searchParams.get("token");
      const jwtPayload = token ? authenticateViewer(token) : null;
      const session = jwtPayload ? await findVncSessionById(sessionId) : null;

      if (!jwtPayload || !session) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId, session.agentId);
        entry.viewerSocket = ws;
        entry.viewerRole = jwtPayload.role;
        entry.viewerUserId = jwtPayload.userId;
        entry.viewerUsername = jwtPayload.username;

        ws.on("message", (data, isBinary) => {
          const current = sessions.get(sessionId);
          if (!current) return;

          if (!isBinary) {
            let msg = null;
            try {
              msg = JSON.parse(data.toString());
            } catch {
              /* not JSON - ignore (e.g. anything else), still forward below */
            }

            if (msg?.type === "upload_start") {
              // Stricter than the admin/operator connection threshold - writing
              // an arbitrary file to a remote disk is a bigger blast radius than
              // reading/viewing the screen. Not forwarded to the agent unless the viewer
              // is EXACTLY "admin".
              if (current.viewerRole !== "admin") {
                try {
                  ws.send(
                    JSON.stringify({
                      type: "upload_result",
                      requestId: msg.requestId,
                      success: false,
                      error: "Samo administratori mogu da otpremaju fajlove na udaljenu mašinu.",
                    }),
                  );
                } catch {
                  /* best effort */
                }
                return;
              }
              insertActivityLog({
                userId: current.viewerUserId ?? null,
                username: current.viewerUsername ?? null,
                action: "file_transfer_upload",
                ipAddress: null,
                statusCode: null,
                details: JSON.stringify({ agentId: current.agentId, sessionId, path: msg.path, fileName: msg.fileName, size: msg.size }),
              }).catch(() => {});
            } else if (msg?.type === "list") {
              insertActivityLog({
                userId: current.viewerUserId ?? null,
                username: current.viewerUsername ?? null,
                action: "file_transfer_list",
                ipAddress: null,
                statusCode: null,
                details: JSON.stringify({ agentId: current.agentId, sessionId, path: msg.path }),
              }).catch(() => {});
            }
          }

          const agentSocket = current.agentSocket;
          if (agentSocket?.readyState === WebSocket.OPEN) agentSocket.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "viewer_disconnected"));
        ws.on("error", () => closeSession(sessionId, "viewer_error"));
      });
      return;
    }

    // Deliberately no socket.destroy() - same reason as the URL parse catch above.
  });
}

// Called from backend/services/fileTransfer.service.js (the hybrid HTTP
// download path - see the note at the top of the file). Writes DIRECTLY to `res` as
// bytes arrive from the agent over WS, instead of accumulating them in memory.
// Refuses if the session/agent isn't connected, or if another
// download is already in progress for the same sessionId - deliberately simplified to "one
// transfer at a time per session" (an internal RMM tool, low concurrency in
// practice for one admin looking at one agent).
export function streamDownloadToResponse(sessionId, filePath, res) {
  return new Promise((resolve, reject) => {
    const entry = sessions.get(sessionId);
    if (!entry || entry.agentSocket?.readyState !== WebSocket.OPEN) {
      reject(new Error("Fajl-transfer kanal nije povezan za ovu sesiju (da li je VNC sesija još aktivna?)."));
      return;
    }
    if (entry.pendingDownload) {
      reject(new Error("Već je u toku drugo preuzimanje fajla za ovu sesiju."));
      return;
    }

    const requestId = crypto.randomUUID();
    entry.pendingDownload = { requestId, res, resolve, reject };

    try {
      entry.agentSocket.send(JSON.stringify({ type: "download", path: filePath, requestId }));
    } catch (err) {
      entry.pendingDownload = null;
      reject(err);
    }
  });
}
