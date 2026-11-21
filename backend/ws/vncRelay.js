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

// remoteAddress stize kao IPv4-mapirani IPv6 (::ffff:10.x) ili ::1 za
// loopback - normalizuj na goli IPv4 da bi se poklopio sa ip_entries.ip. Kad
// backend sam servira frontend (same-origin, vidi CORS napomenu u
// routes/index.js) nema proxy-ja, ali X-Forwarded-For se postuje ako postoji.
function viewerIpFromRequest(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  let ip = fwd || req.socket?.remoteAddress || "";
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  return ip || null;
}

// MAC IKT (viewer) radne stanice se ne moze dobiti iz browsera - jedini
// server-side izvor je razresavanje IP-a preko ip_entries -> computer_metadata
// NIC-ova. Vraca null ako stanica nije upravljana (nema agenta/metapodataka).
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

// Neizbrisivi audit trag pocetka sesije (akt: ime IKT radnika, ime
// odobravaoca, tacno vreme, IP+MAC obe radne stanice). Cita svezu sesiju da
// pokupi viewer IP/MAC (upisan kad se IKT browser zakacio) i agent IP/MAC +
// odobravaoca (upisano pri pristanku).
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
      // Ne uništavamo socket ovde bezuslovno - ostavlja prostor da neki
      // drugi "upgrade" listener na istom HTTPS serveru obradi putanju koju
      // ovaj handler ne prepoznaje (Node poziva SVAKI registrovani listener,
      // ne samo prvi koji se poklopi). Neprepoznata/nevalidna putanja
      // jednostavno ostaje nerukovana ako je nijedan handler ne prepozna -
      // klijent dobija timeout umesto eksplicitnog RST-a.
      return;
    }

    if (url.pathname === "/api/agents/vnc-stream") {
      const agent = await authenticateAgentSocket(url);
      const sessionId = Number(url.searchParams.get("sessionId"));
      const session = sessionId ? await findVncSessionById(sessionId) : null;

      // Zabrana samoinicijativnog preuzimanja ekrana: most se NE sme
      // uspostaviti dok korisnik na radnoj stanici nije eksplicitno odobrio
      // sesiju. Agent to i sam postuje (ne zove vnc-stream bez 'granted'),
      // ovo je odbrana u dubinu na serverskoj strani.
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

        // Listener-i se kace SINHRONO, pre bilo kakvog await-a - "ws" ne
        // bafera poruke stigle pre nego sto postoji "message" listener, pa bi
        // await pre ovoga ispustio prve RFB bajtove (framebuffer update koji
        // agent posalje odmah po otvaranju).
        ws.on("message", (data, isBinary) => {
          const viewer = sessions.get(sessionId)?.viewerSocket;
          if (viewer?.readyState === WebSocket.OPEN) viewer.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "agent_disconnected"));
        ws.on("error", () => closeSession(sessionId, "agent_error"));

        // Aktivacija + neizbrisivi audit zapis pocetka sesije - async, posle
        // kacenja listener-a. markVncSessionActive sam proverava 'granted'.
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

        // Listener-i sinhrono, pre await-a (isti razlog kao agent strana -
        // "ws" ne bafera poruke stigle pre "message" listener-a).
        ws.on("message", (data, isBinary) => {
          const agentSocket = sessions.get(sessionId)?.agentSocket;
          if (agentSocket?.readyState === WebSocket.OPEN) agentSocket.send(data, { binary: isBinary });
        });
        ws.on("close", () => closeSession(sessionId, "viewer_disconnected"));
        ws.on("error", () => closeSession(sessionId, "viewer_error"));

        // IP+MAC IKT radne stanice za audit (akt trazi obe stanice). MAC se
        // razresava preko ip_entries - null ako IKT stanica nije upravljana.
        resolveViewerMac(viewerIp)
          .then((viewerMac) => setVncSessionViewerInfo(sessionId, { viewerIp, viewerMac }))
          .catch((err) => console.error("setVncSessionViewerInfo neuspešno", err));
      });
      return;
    }

    // Namerno NEMA socket.destroy() ovde - vidi napomenu kod URL parse
    // catch-a iznad, ovaj handler ne sme da uništi socket za putanje koje
    // pripadaju nekom drugom "upgrade" handleru na istom serveru.
  });
}
