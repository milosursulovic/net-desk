import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import {
  findVncSessionById,
  markVncSessionActive,
  setVncSessionViewerInfo,
} from "../repositories/vncSessions.repo.js";
import { endVncSessionService } from "../services/vncSessions.service.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";
import { findIpEntryIdByIp } from "../repositories/ipEntries.repo.js";
import { findMacsForIpEntry } from "../repositories/metadata.repo.js";

// 30 min hard cap so an abandoned/forgotten session can't stream/control a
// machine indefinitely.
const MAX_SESSION_MS = 30 * 60 * 1000;

// sessionId -> { agentSocket, viewerSocket, agentId, startedAt, timeoutHandle,
//                requestedByUserId, requestedByUsername }
const sessions = new Map();

// Mirrors middlewares/agentAuth.middleware.js's authenticateAgent - can't
// reuse it directly since this runs on the raw "upgrade" event, not as
// Express middleware (no req/res/next cycle for a WS handshake).
//
// Credentials arrive as ?agentId=<uid>&apiKey=<key> query params, not an
// Authorization header, even though the agent is a real (non-browser) WS
// client that normally could set one - the C# agent's WebSocket library
// (websocket-sharp, swapped in after ClientWebSocket turned out to be
// unsupported on Windows 7) has no public API for custom request headers.
// Same query-string pattern the viewer side already uses for the same
// underlying reason (its WebSocket client - the browser - can't set custom
// headers either), and the same security context applies: this is the raw
// "upgrade" event, not routed through Express/morgan, so it never reaches
// the access log.
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

// remoteAddress arrives as IPv4-mapped IPv6 (::ffff:10.x) or ::1 for
// loopback - normalize to bare IPv4 so it matches ip_entries.ip. When the
// backend serves the frontend itself (same-origin, see the CORS note in
// routes/index.js) there's no proxy, but X-Forwarded-For is honored if present.
function viewerIpFromRequest(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  let ip = fwd || req.socket?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  return ip || null;
}

// The MAC of the IT worker's (viewer) workstation can't be obtained from the browser - the only
// server-side source is resolving the IP via ip_entries -> computer_metadata
// NICs. Returns null if the workstation isn't managed (no agent/metadata).
async function resolveViewerMac(viewerIp) {
  if (!viewerIp) return null;
  try {
    const ipEntryId = await findIpEntryIdByIp(viewerIp);
    if (!ipEntryId) return null;
    const macs = await findMacsForIpEntry(ipEntryId);
    return macs.length ? macs.join(", ") : null;
  } catch {
    return null;
  }
}

// Indelible audit trail of the session start (the act: IT worker's name, the
// approver's name, exact time, IP+MAC of both workstations). Reads the fresh session to
// pick up the viewer IP/MAC (written when the IT worker's browser attached) and the agent IP/MAC +
// approver (written at consent time).
async function logVncSessionStarted(sessionId) {
  const s = await findVncSessionById(sessionId);
  if (!s) return;
  const entry = sessions.get(sessionId);
  await insertActivityLog({
    userId: s.requestedByUserId ?? null,
    username: entry?.requestedByUsername ?? null,
    action: "vnc_session_started",
    ipAddress: s.viewerIp ?? null,
    statusCode: null,
    details: JSON.stringify({
      sessionId,
      agentId: s.agentId,
      approverUsername: s.approverUsername ?? null,
      consentAt: s.consentAt ?? null,
      agentIp: s.agentIp ?? null,
      agentMac: s.agentMac ?? null,
      viewerIp: s.viewerIp ?? null,
      viewerMac: s.viewerMac ?? null,
    }),
  });
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
 * Relay is bidirectional pure byte passthrough - both directions carry raw
 * RFB protocol bytes (real VNC server on one end via the agent's TCP<->WS
 * bridge, noVNC's RFB client on the other), this layer never parses either.
 */
export function attachVncRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    // Nagle's algorithm is on by default for a net/tls.Socket - it batches
    // small writes for up to ~40ms hoping to coalesce them, which is
    // exactly wrong for a relay carrying individual RFB messages (mouse
    // moves, small incremental screen updates).
    socket.setNoDelay(true);

    let url;
    try {
      url = new URL(req.url, "https://placeholder.invalid");
    } catch {
      // We don't destroy the socket here unconditionally - this leaves room for some
      // other "upgrade" listener on the same HTTPS server to handle a path that
      // this handler doesn't recognize (Node calls EVERY registered listener,
      // not just the first one that matches). An unrecognized/invalid path
      // simply stays unhandled if no handler recognizes it -
      // the client gets a timeout instead of an explicit RST.
      return;
    }

    if (url.pathname === "/api/agents/vnc-stream") {
      const agent = await authenticateAgentSocket(url);
      const sessionId = Number(url.searchParams.get("sessionId"));
      const session = sessionId ? await findVncSessionById(sessionId) : null;

      // Ban on unsolicited screen capture: the bridge must NOT be
      // established until the user at the workstation has explicitly approved the
      // session. The agent honors this itself (doesn't call vnc-stream without 'granted'),
      // this is server-side defense in depth.
      if (
        !agent ||
        !session ||
        session.agentId !== agent.id ||
        session.consentStatus !== "granted"
      ) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId, agent.id);
        entry.agentSocket = ws;

        // Listeners are attached SYNCHRONOUSLY, before any await - "ws" doesn't
        // buffer messages that arrive before a "message" listener exists, so an
        // await before this would drop the first RFB bytes (the framebuffer update the
        // agent sends right after opening).
        ws.on("message", (data, isBinary) => {
          const viewer = sessions.get(sessionId)?.viewerSocket;
          if (viewer?.readyState === WebSocket.OPEN) viewer.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "agent_disconnected"));
        ws.on("error", () => closeSession(sessionId, "agent_error"));

        // Activation + indelible audit record of the session start - async, after
        // attaching the listeners. markVncSessionActive checks 'granted' itself.
        markVncSessionActive(sessionId)
          .then((activated) => (activated ? logVncSessionStarted(sessionId) : null))
          .catch((err) => console.error("markVncSessionActive neuspešno", err));
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

      const viewerIp = viewerIpFromRequest(req);

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId, session.agentId);
        entry.viewerSocket = ws;
        entry.requestedByUserId = jwtPayload.userId;
        entry.requestedByUsername = jwtPayload.username;

        // Listeners synchronously, before await (same reason as the agent side -
        // "ws" doesn't buffer messages that arrive before the "message" listener).
        ws.on("message", (data, isBinary) => {
          const agentSocket = sessions.get(sessionId)?.agentSocket;
          if (agentSocket?.readyState === WebSocket.OPEN) agentSocket.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "viewer_disconnected"));
        ws.on("error", () => closeSession(sessionId, "viewer_error"));

        // IP+MAC of the IT worker's workstation for the audit (the act requires both workstations). The MAC is
        // resolved via ip_entries - null if the IT worker's workstation isn't managed.
        resolveViewerMac(viewerIp)
          .then((viewerMac) => setVncSessionViewerInfo(sessionId, { viewerIp, viewerMac }))
          .catch((err) => console.error("setVncSessionViewerInfo neuspešno", err));
      });
      return;
    }

    // Deliberately NO socket.destroy() here - see the note at the URL parse
    // catch above, this handler must not destroy the socket for paths that
    // belong to some other "upgrade" handler on the same server.
  });
}
