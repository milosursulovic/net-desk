import {
  insertVncSession,
  findVncSessionById,
  markVncSessionEnded,
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

  const sessionId = await insertVncSession({ agentId, requestedByUserId });

  // Isti job-poll mehanizam kao svaka druga komanda (do ~15s da agent
  // primeti) - namerno se ne gradi posebna "probudi agenta odmah"
  // signalizacija samo za ovo. Sam RFB kanal je posle toga real-time
  // (WebSocket byte-forwarding, vidi ws/vncRelay.js), agent samo prosleđuje
  // sirove bajtove ka lokalnom UltraVNC-u (127.0.0.1) - ne dodiruje ekran/
  // input direktno.
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
