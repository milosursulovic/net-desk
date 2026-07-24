import { WebSocketServer } from "ws";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import {
  findVncSessionById,
  markVncSessionActive,
} from "../repositories/vncSessions.repo.js";
import { endVncSessionService } from "../services/vncSessions.service.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";

// 30 min hard cap so an abandoned/forgotten session can't stream (or,
// eventually in a later phase, control input on) a machine indefinitely.
const MAX_SESSION_MS = 30 * 60 * 1000;

// sessionId -> { agentSocket, viewerSocket, agentId, startedAt, timeoutHandle,
//                requestedByUserId, requestedByUsername }
const sessions = new Map();

function parseBearer(req) {
  const auth = req.headers["authorization"] || "";
  const [type, token] = auth.split(" ");
  return type === "Bearer" && token ? token : null;
}

// Mirrors middlewares/agentAuth.middleware.js's authenticateAgent - can't
// reuse it directly since this runs on the raw "upgrade" event, not as
// Express middleware (no req/res/next cycle for a WS handshake).
async function authenticateAgentSocket(req) {
  const token = parseBearer(req);
  const sepIdx = token ? token.indexOf(":") : -1;
  if (sepIdx <= 0) return null;

  const agentUid = token.slice(0, sepIdx);
  const apiKey = token.slice(sepIdx + 1);

  const agent = await findAgentByUid(agentUid);
  if (!agent || agent.status !== "active") return null;

  const providedHash = Buffer.from(hashApiKey(apiKey), "hex");
  const storedHash = Buffer.from(agent.apiKeyHash, "hex");
  const isMatch =
    providedHash.length === storedHash.length &&
    crypto.timingSafeEqual(providedHash, storedHash);

  return isMatch ? agent : null;
}

// Browsers' native WebSocket API can't set custom headers, so the viewer
// side authenticates via a ?token= query param instead of Authorization -
// standard pattern for browser-originated WS auth. This runs on the raw
// "upgrade" event (not through Express), so it never reaches morgan's
// access log - the token is not logged.
function authenticateViewer(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin" && payload.role !== "operator") return null;
    return payload;
  } catch {
    return null;
  }
}

async function closeSession(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);

  clearTimeout(session.timeoutHandle);
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

  try {
    await endVncSessionService(sessionId);
    await insertActivityLog({
      userId: session.requestedByUserId ?? null,
      username: session.requestedByUsername ?? null,
      action: "vnc_session_ended",
      ipAddress: null,
      statusCode: null,
      details: JSON.stringify({
        agentId: session.agentId,
        durationMs: Date.now() - session.startedAt,
        reason,
      }),
    });
  } catch (err) {
    console.error("Neuspešno finalizovanje VNC sesije #" + sessionId, err);
  }
}

function getOrCreateSession(sessionId, agentId) {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = { agentId, startedAt: Date.now() };
    entry.timeoutHandle = setTimeout(() => closeSession(sessionId, "timeout"), MAX_SESSION_MS);
    sessions.set(sessionId, entry);
  }
  return entry;
}

/**
 * Attaches the VNC relay to the app's existing https.Server (same port/
 * cert, no new firewall rule) via the raw "upgrade" event - Express 5
 * doesn't handle WebSocket upgrades itself. Two logical endpoints, told
 * apart by path:
 *   - /api/agents/vnc-stream?sessionId=N       (agent, outbound-initiated)
 *   - /api/protected/vnc-stream/:sessionId?token=JWT  (admin browser)
 * Relay is bidirectional and does no transformation: binary frames from
 * the agent go to the viewer, JSON input events from the viewer go to the
 * agent (input injection lands in a later change; the wiring here doesn't
 * care what the bytes mean).
 */
export function attachVncRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "https://placeholder.invalid");
    } catch {
      socket.destroy();
      return;
    }

    if (url.pathname === "/api/agents/vnc-stream") {
      const agent = await authenticateAgentSocket(req);
      const sessionId = Number(url.searchParams.get("sessionId"));
      const session = sessionId ? await findVncSessionById(sessionId) : null;

      if (!agent || !session || session.agentId !== agent.id) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId, agent.id);
        entry.agentSocket = ws;
        markVncSessionActive(sessionId).catch((err) =>
          console.error("markVncSessionActive neuspešno", err),
        );

        ws.on("message", (data, isBinary) => {
          const viewer = sessions.get(sessionId)?.viewerSocket;
          if (viewer?.readyState === viewer.OPEN) viewer.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "agent_disconnected"));
        ws.on("error", () => closeSession(sessionId, "agent_error"));
      });
      return;
    }

    const viewerMatch = url.pathname.match(/^\/api\/protected\/vnc-stream\/(\d+)$/);
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
        entry.requestedByUserId = jwtPayload.userId;
        entry.requestedByUsername = jwtPayload.username;

        ws.on("message", (data) => {
          const agentSocket = sessions.get(sessionId)?.agentSocket;
          if (agentSocket?.readyState === agentSocket.OPEN) agentSocket.send(data);
        });
        ws.on("close", () => closeSession(sessionId, "viewer_disconnected"));
        ws.on("error", () => closeSession(sessionId, "viewer_error"));
      });
      return;
    }

    socket.destroy();
  });
}
