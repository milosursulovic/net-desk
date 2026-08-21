import {
  insertVncSession,
  findVncSessionById,
  markVncSessionEnded,
  markVncSessionFallbackToRfb,
} from "../repositories/vncSessions.repo.js";
import { insertJob } from "../repositories/agentJobs.repo.js";
import { findAgentById } from "../repositories/agents.repo.js";
import { isFeatureEnabled } from "./appSettings.service.js";
import { VNC_SHARED_PASSWORD } from "../config/env.js";
import { badRequest, forbidden, notFound } from "../utils/httpError.js";

export async function startVncSessionService(agentId, requestedByUserId) {
  const vncEnabled = await isFeatureEnabled("vnc_enabled");
  if (!vncEnabled) {
    throw forbidden("VNC funkcionalnost je trenutno onemogućena u podešavanjima aplikacije");
  }

  const agent = await findAgentById(agentId);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  if (agent.status !== "active") {
    throw badRequest("Agent nije aktivan");
  }

  // Tier odluka ovde, ne na frontend-u i ne na osnovu deployment grupe -
  // agents.remote_control_tier je agent-ova SOPSTVENA, uživo prijavljena
  // (enroll/heartbeat) tvrdnja o svom build-u, jedini pouzdan signal (grupa
  // je samo statička admin-oznaka za targeting, agent u "win10" grupi može
  // i dalje da radi na starom net452 build-u dok se rollout ne završi -
  // vidi Faza 1 plan).
  const webrtcFlagOn = await isFeatureEnabled("vnc_webrtc_enabled");
  const sessionType =
    webrtcFlagOn && agent.remoteControlTier === "webrtc_capable" ? "webrtc" : "rfb";

  const sessionId = await insertVncSession({ agentId, requestedByUserId, sessionType });

  // Isti job-poll mehanizam kao svaka druga komanda (do ~15s da agent
  // primeti) - namerno se ne gradi posebna "probudi agenta odmah"
  // signalizacija samo za ovo. RFB kanal je posle toga real-time (WebSocket
  // byte-forwarding, vidi ws/vncRelay.js), agent samo prosleđuje sirove
  // bajtove ka lokalnom UltraVNC-u. WebRTC kanal ide preko
  // ws/webrtcSignaling.js (SDP/ICE razmena) - agent posle toga sam hvata/
  // enkoduje ekran (vidi Netdesk.Agent.Common/Webrtc/).
  await insertJob({
    agentId,
    commandType: sessionType === "webrtc" ? "start_webrtc_bridge" : "start_vnc_bridge",
    payload: { sessionId },
    createdByUserId: requestedByUserId,
  });

  const session = await findVncSessionById(sessionId);
  return { ...session, vncPassword: VNC_SHARED_PASSWORD };
}

export async function endVncSessionService(sessionId) {
  const session = await findVncSessionById(sessionId);
  if (!session) {
    throw notFound("VNC sesija nije pronađena");
  }
  await markVncSessionEnded(sessionId);
  return await findVncSessionById(sessionId);
}

// Poziva se iz ws/webrtcSignaling.js kad agent-strana (WebRtcBridge.exe)
// javi da WebRTC nije uspeo (ICE failed, capture/enkoder init pao, itd.) -
// prebacuje ISTU sesiju na RFB i pokreće postojeći start_vnc_bridge job kao
// da je RFB od početka izabran. sessionId ostaje stabilan (activityLog
// korelacija u ws/vncRelay.js closeSession-u se ne prekida).
export async function fallbackVncSessionToRfbService(sessionId) {
  const session = await findVncSessionById(sessionId);
  if (!session) return null;

  await markVncSessionFallbackToRfb(sessionId);
  await insertJob({
    agentId: session.agentId,
    commandType: "start_vnc_bridge",
    payload: { sessionId },
    createdByUserId: session.requestedByUserId,
  });
  return await findVncSessionById(sessionId);
}
