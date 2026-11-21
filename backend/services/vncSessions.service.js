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

  // The same job-poll mechanism as every other command (up to ~15s for the agent
  // to notice) - deliberately no separate "wake the agent immediately"
  // signaling just for this. After that the channel is real-time (WebSocket
  // byte-forwarding, see ws/vncRelay.js), the agent just forwards raw
  // bytes to the local UltraVNC.
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

// The agent reports the outcome of the consent dialog from the workstation. It must be
// called BEFORE the agent brings up the VNC bridge (see service/.../AgentWorker.cs and
// the VncBridge gate in ws/vncRelay.js). The permanent, indelible trail goes to
// activity_log (append-only) - here is all the content the act requires except the
// viewer IP/MAC (known only once the IT worker's browser attaches, filled in by ws/vncRelay.js).
export async function recordVncConsentService(
  sessionId,
  agentId,
  { consentStatus, approverUsername, agentIp, agentMac },
) {
  const session = await findVncSessionById(sessionId);
  if (!session) {
    throw notFound("VNC sesija nije pronađena");
  }
  // The agent may report consent only for its OWN session.
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
