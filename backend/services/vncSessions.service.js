import {
  insertVncSession,
  findVncSessionById,
  markVncSessionEnded,
} from "../repositories/vncSessions.repo.js";
import { insertJob } from "../repositories/agentJobs.repo.js";
import { findAgentById } from "../repositories/agents.repo.js";
import { isFeatureEnabled } from "./appSettings.service.js";
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
  // signalizacija samo za ovo. Sam video/input kanal je posle toga
  // real-time (WebSocket, vidi ws/vncRelay.js).
  await insertJob({
    agentId,
    commandType: "start_vnc_stream",
    payload: { sessionId },
    createdByUserId: requestedByUserId,
  });

  return await findVncSessionById(sessionId);
}

export async function endVncSessionService(sessionId) {
  const session = await findVncSessionById(sessionId);
  if (!session) {
    throw notFound("VNC sesija nije pronađena");
  }
  await markVncSessionEnded(sessionId);
  return await findVncSessionById(sessionId);
}
