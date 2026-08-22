import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import {
  findVncSessionById,
  insertWebrtcSignalingMessage,
} from "../repositories/vncSessions.repo.js";
import { fallbackVncSessionToRfbService } from "../services/vncSessions.service.js";

// 30 min - isti hard cap kao ws/vncRelay.js (vidi komentar tamo), ista
// briga (zaboravljena/napuštena sesija ne sme da drži signaling socket
// otvoren zauvek).
const MAX_SESSION_MS = 30 * 60 * 1000;

// sessionId -> { agentSocket, viewerSocket, timeoutHandle }
const sessions = new Map();

// Mirror ws/vncRelay.js's authenticateAgentSocket - ista arhitektonska
// prinuda (raw "upgrade" event, ne Express middleware, pa se ne može
// ponovo iskoristiti authenticateAgent iz middlewares/agentAuth.middleware.js
// direktno).
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

// Mirror ws/vncRelay.js's authenticateViewer.
function authenticateViewer(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (payload.role !== "admin" && payload.role !== "operator") return null;
    return payload;
  } catch {
    return null;
  }
}

function closeSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  sessions.delete(sessionId);

  clearTimeout(session.timeoutHandle);
  try {
    session.agentSocket?.close();
  } catch {
    /* već zatvoren */
  }
  try {
    session.viewerSocket?.close();
  } catch {
    /* već zatvoren */
  }
}

function getOrCreateSession(sessionId) {
  let entry = sessions.get(sessionId);
  if (!entry) {
    entry = {};
    entry.timeoutHandle = setTimeout(() => closeSession(sessionId), MAX_SESSION_MS);
    sessions.set(sessionId, entry);
  }
  return entry;
}

/**
 * SDP offer/answer + ICE kandidat signaling za WebRTC put (Faza 2 plan) -
 * strukturno mirror ws/vncRelay.js (isti auth obrazac, isti /api/agents/...
 * vs /api/protected/... split, isto kačenje na "upgrade" event postojećeg
 * HTTPS servera), ali nosi male JSON tekst poruke umesto binarnih RFB
 * bajtova, i traje samo dok se ICE/DTLS ne uspostavi - sam video/input
 * saobraćaj posle toga NE prolazi kroz backend (direktno ili preko TURN-a,
 * van dosega ovog fajla), za razliku od RFB releja koji ostaje trajna cev
 * za celu sesiju.
 *
 * NIJE runtime testirano sa pravim WebRTC peer-om u ovoj sesiji (nema
 * Windows agenta/pravog browsera koji bi stvarno razmenili SDP ovde) -
 * verifikovano samo kroz čitanje/poređenje sa vncRelay.js-ovim već-
 * proverenim obrascem.
 */
export function attachWebrtcSignaling(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "https://placeholder.invalid");
    } catch {
      return; // ne socket.destroy() ovde - drugi handler (vncRelay) na istom
      // "upgrade" event-u treba šansu da obradi putanje koje ne prepoznaje
    }

    if (url.pathname === "/api/agents/webrtc-signaling") {
      const agent = await authenticateAgentSocket(url);
      const sessionId = Number(url.searchParams.get("sessionId"));
      const session = sessionId ? await findVncSessionById(sessionId) : null;

      if (!agent || !session || session.agentId !== agent.id) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const entry = getOrCreateSession(sessionId);
        entry.agentSocket = ws;

        ws.on("message", (data) => handleAgentMessage(sessionId, data));
        ws.on("close", () => closeSession(sessionId));
        ws.on("error", () => closeSession(sessionId));
      });
      return;
    }

    const viewerMatch = url.pathname.match(/^\/api\/protected\/webrtc-signaling\/(\d+)$/);
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
        const entry = getOrCreateSession(sessionId);
        entry.viewerSocket = ws;

        ws.on("message", (data) => handleViewerMessage(sessionId, data));
        ws.on("close", () => closeSession(sessionId));
        ws.on("error", () => closeSession(sessionId));
      });
      return;
    }

    // Ni jedna putanja se ne poklapa - ne diramo socket, isti razlog kao
    // URL parse catch iznad (vncRelay.js na istom serveru je drugi upgrade
    // listener, mora da dobije priliku da obradi svoje putanje).
  });
}

function persistMessage(sessionId, direction, raw) {
  // Best-effort - audit log ne sme da obori live signaling ako baza
  // trenutno zaguši.
  insertWebrtcSignalingMessage(sessionId, direction, raw).catch(() => {});
}

// Bilo koja strana može da prijavi "failed" - agent (WebRtcBridge.exe, npr.
// ICE/capture/enkoder inicijalizacija pala) ILI viewer (browser-ova
// RTCPeerConnection.connectionState postane "failed", npr. TURN
// nedostupan/blokiran, agent-ova strana i dalje misli da je sve u redu jer
// njeni ICE kandidati nikad nisu ni stigli do browsera). U oba slučaja: baza
// se prebacuje na RFB JEDNOM (idempotentno - vidi markVncSessionFallbackToRfb,
// bezopasno da se pozove dvaput za isti sessionId), viewer dobija "fallback"
// (Faza 3 frontend re-dial na RFB granu ISTOG sessionId-a) da bi UI mogao
// bezbedno da pređe TEK pošto je baza već ažurirana (izbegava trku gde bi
// viewer sam odlučio da pređe na RFB pre nego što je start_vnc_bridge job
// uopšte upisan), a agent dobija "stop" da WebRtcBridge.exe čisto izađe
// umesto da ostane da visi na signaling konekciji bez ikoga na drugom kraju.
// Exported (ne samo lokalno korišćen ispod) - agentJobs.service.js ovo
// poziva kad start_webrtc_bridge job PADNE pre nego što je WebRtcBridge.exe
// ikad stigao da otvori signaling konekciju (npr. nema aktivne interaktivne
// sesije za SessionLauncher - videti AgentWorker.RunWebRtcBridge). Taj
// neuspeh stiže preko običnog job-result endpoint-a, ne preko ove WS veze,
// pa bez ovog exporta triggerFallback ne bi ni saznao da treba da obavesti
// viewer-a - ostao bi zauvek na "Povezujem" čekajući signaling poruku koja
// nikad neće stići.
export async function triggerFallback(sessionId) {
  await fallbackVncSessionToRfbService(sessionId).catch(() => {});
  const session = sessions.get(sessionId);
  if (session?.viewerSocket?.readyState === WebSocket.OPEN) {
    session.viewerSocket.send(JSON.stringify({ type: "fallback" }));
  }
  if (session?.agentSocket?.readyState === WebSocket.OPEN) {
    session.agentSocket.send(JSON.stringify({ type: "stop" }));
  }
}

async function handleAgentMessage(sessionId, data) {
  const raw = data.toString();
  persistMessage(sessionId, "agent_to_viewer", raw);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (parsed.type === "failed") {
    await triggerFallback(sessionId);
    return;
  }

  const viewer = sessions.get(sessionId)?.viewerSocket;
  if (viewer?.readyState === WebSocket.OPEN) viewer.send(raw);
}

async function handleViewerMessage(sessionId, data) {
  const raw = data.toString();
  persistMessage(sessionId, "viewer_to_agent", raw);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }

  if (parsed?.type === "failed") {
    await triggerFallback(sessionId);
    return;
  }

  const agentSocket = sessions.get(sessionId)?.agentSocket;
  if (agentSocket?.readyState === WebSocket.OPEN) agentSocket.send(raw);
}
