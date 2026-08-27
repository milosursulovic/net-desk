import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import { findVncSessionById } from "../repositories/vncSessions.repo.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";

// Isti 30-min hard cap kao ws/vncRelay.js, isti razlog (zaboravljena/
// napuštena sesija ne sme da drži kanal otvoren zauvek). Odvojena mapa/
// tajmer od vncRelay.js - fajl-transfer kanal ima sopstveni životni vek,
// namerno NE deli CancellationToken/socket sa VNC ekranskim kanalom (vidi
// AgentWorker.cs) - zatvaranje jednog ne sme da obori drugi.
const MAX_SESSION_MS = 30 * 60 * 1000;

// sessionId -> { agentSocket, viewerSocket, agentId, startedAt, timeoutHandle,
//                viewerRole, viewerUserId, viewerUsername, pendingDownload }
// pendingDownload (kad postoji): { requestId, res }
const sessions = new Map();

// Isto kao ws/vncRelay.js's authenticateAgentSocket - namerno duplirano
// umesto deljeno (isti razlog kao ws/webrtcSignaling.js je nekad imao:
// svaki WS "upgrade" handler na server.on("upgrade") mora sam da parsira
// svoj URL/auth, nema express middleware lanac ovde).
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

// Isto kao ws/vncRelay.js's authenticateViewer - isti "admin"/"operator"
// prag kao gledanje ekrana (obično "viewer" ne sme ni VNC ekran da gleda).
// Otpremanje fajlova (upload) je STROŽE od ovoga - vidi proveru u
// viewer ws.on("message") ispod, gde se dodatno traži TAČNO "admin".
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
 * Treći WS relay na istom HTTPS serveru kao ws/vncRelay.js (isti "upgrade"
 * event, isti port/sertifikat) - namenski ODVOJEN kanal za AnyDesk-stil
 * transfer fajlova tokom VNC sesije (kopiraj fajl sa udaljene mašine /
 * otpremi fajl na nju), pošto RFB/VNC protokol nema koncept fajla.
 *
 *   - /api/agents/file-transfer?sessionId=N          (agent, outbound-initiated)
 *   - /api/protected/file-transfer/:sessionId?token=JWT  (admin browser)
 *
 * Uglavnom slep bidirekcioni passthrough (kao vncRelay.js) za "list"/
 * "upload_*" poruke, SA DVE namernim izuzetkom:
 *   1) viewer->agent "upload_start" poruka se propušta SAMO ako je
 *      viewer-ov JWT role tačno "admin" (strože od "admin"/"operator" praga
 *      za konekciju/list/download - pisanje proizvoljnog fajla na udaljeni
 *      disk je veći blast radius od čitanja/gledanja ekrana).
 *   2) "download" (preuzimanje sa udaljene mašine) NE ide preko viewer-ovog
 *      WS-a uopšte - to je hibridni put preko obične HTTP GET rute
 *      (routes/agentsAdmin.routes.js), koja poziva streamDownloadToResponse
 *      ispod da prosledi zahtev agent-u i piše dolazne bajtove DIREKTNO na
 *      HTTP response - izbegava Blob-akumulaciju i OOM rizik u browseru za
 *      velike fajlove, browser strana je obična `<a href>` veza.
 */
export function attachFileTransferRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "https://placeholder.invalid");
    } catch {
      // Namerno bez socket.destroy() - drugi "upgrade" handler na istom
      // serveru (vncRelay.js, webrtcSignaling.js ranije) treba šansu da
      // obradi putanje koje ovaj ne prepoznaje.
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

          // Dok je download u toku, SVE što stigne od agenta (JSON
          // download_start/download_end/download_error kao tekst, sirovi
          // bajtovi kao binarno) ide na HTTP response, NE viewer-ovom WS-u -
          // download ne prolazi kroz viewer socket uopšte (vidi napomenu na
          // vrhu fajla).
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
              /* nije JSON - ignoriši, ne prosleđuj dalje */
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
              /* nije JSON - ignoriši (npr. bilo šta drugo), i dalje prosledi dole */
            }

            if (msg?.type === "upload_start") {
              // Strože od konekcionog admin/operator praga - pisanje
              // proizvoljnog fajla na udaljeni disk je veći blast radius od
              // čitanja/gledanja ekrana. Ne prosleđuje se agentu ako viewer
              // nije TAČNO "admin".
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

    // Namerno bez socket.destroy() - isti razlog kao URL parse catch iznad.
  });
}

// Pozvano iz backend/services/fileTransfer.service.js (hibridni HTTP
// download put - vidi napomenu na vrhu fajla). Piše DIREKTNO na `res` kako
// bajtovi stižu od agenta preko WS-a, umesto da ih akumulira u memoriji.
// Odbija ako sesija/agent nije povezan, ili ako je već u toku drugo
// preuzimanje za isti sessionId - namerno pojednostavljeno na "jedan
// transfer odjednom po sesiji" (interni RMM alat, niska konkurentnost u
// praksi za jednog admina koji gleda jednog agenta).
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
