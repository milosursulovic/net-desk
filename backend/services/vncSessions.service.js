import {
  insertVncSession,
  findVncSessionById,
  markVncSessionEnded,
  markVncSessionConsentGranted,
  markVncSessionConsentDenied,
} from "../repositories/vncSessions.repo.js";
import { insertJob } from "../repositories/agentJobs.repo.js";
import { findAgentById } from "../repositories/agents.repo.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";
import { findUserById } from "../repositories/users.repo.js";
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

  const sessionId = await insertVncSession({ agentId, requestedByUserId });

  // Isti job-poll mehanizam kao svaka druga komanda (do ~15s da agent
  // primeti) - namerno se ne gradi posebna "probudi agenta odmah"
  // signalizacija samo za ovo. Kanal je posle toga real-time (WebSocket
  // byte-forwarding, vidi ws/vncRelay.js), agent samo prosleđuje sirove
  // bajtove ka lokalnom UltraVNC-u.
  await insertJob({
    agentId,
    commandType: "start_vnc_bridge",
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

export async function getVncSessionService(sessionId) {
  const session = await findVncSessionById(sessionId);
  if (!session) {
    throw notFound("VNC sesija nije pronađena");
  }
  return session;
}

// Agent prijavljuje ishod prozora za pristanak sa radne stanice. Mora se
// pozvati PRE nego sto agent digne VNC most (vidi service/.../AgentWorker.cs i
// VncBridge gejt u ws/vncRelay.js). Trajni, neizbrisivi trag ide u
// activity_log (append-only) - ovde je sav sadrzaj koji akt trazi osim
// viewer IP/MAC (poznat tek kad se IKT browser zakaci, dopunjava ws/vncRelay.js).
export async function recordVncConsentService(
  sessionId,
  agentId,
  { consentStatus, approverUsername, agentIp, agentMac },
) {
  const session = await findVncSessionById(sessionId);
  if (!session) {
    throw notFound("VNC sesija nije pronađena");
  }
  // Agent sme da prijavi pristanak samo za SOPSTVENU sesiju.
  if (session.agentId !== agentId) {
    throw forbidden("Sesija ne pripada ovom agentu");
  }
  if (session.consentStatus !== "pending") {
    throw badRequest("Pristanak za ovu sesiju je već evidentiran");
  }

  const payload = { approverUsername, agentIp, agentMac };
  if (consentStatus === "granted") {
    await markVncSessionConsentGranted(sessionId, payload);
  } else {
    await markVncSessionConsentDenied(sessionId, consentStatus, payload);
  }

  const initiator = session.requestedByUserId
    ? await findUserById(session.requestedByUserId)
    : null;

  await insertActivityLog({
    userId: session.requestedByUserId ?? null,
    username: initiator?.username ?? null,
    action: consentStatus === "granted" ? "vnc_consent_granted" : "vnc_consent_denied",
    ipAddress: agentIp ?? null,
    statusCode: null,
    details: JSON.stringify({
      sessionId,
      agentId,
      consentStatus,
      approverUsername: approverUsername ?? null,
      agentIp: agentIp ?? null,
      agentMac: agentMac ?? null,
    }),
  });

  return await findVncSessionById(sessionId);
}
