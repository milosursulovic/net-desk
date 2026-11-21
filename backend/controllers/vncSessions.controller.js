import {
  startVncSessionService,
  endVncSessionService,
  getVncSessionService,
  recordVncConsentService,
} from "../services/vncSessions.service.js";
import { VncConsentSchema } from "../dtos/vncSessions.dto.js";
import { parseIdParam } from "../utils/idParam.js";
import { toInt } from "../utils/numbers.js";
import { badRequest } from "../utils/httpError.js";

export async function startVncSessionController(req, res) {
  const agentId = parseIdParam(req, "id", "ID agenta");
  const session = await startVncSessionService(agentId, req.user?.userId ?? null);
  res.status(201).json(session);
}

export async function endVncSessionController(req, res) {
  const sessionId = toInt(req.body?.sessionId);
  if (!sessionId) throw badRequest("Neispravan ID sesije.");

  const session = await endVncSessionService(sessionId);
  res.json(session);
}

// Admin/operator (JWT) — the frontend polls the status while waiting for user
// consent (to detect 'rejected' and stop trying to connect). Deliberately returns
// only the status, not the audit fields (approver, consent_at, IP/MAC) - those
// are a sensitive audit trail available only to the root admin ("admin") via
// /api/protected/activity-log (requireRootAdmin), not to the operator running the session.
export async function getVncSessionController(req, res) {
  const sessionId = parseIdParam(req, "sessionId", "ID sesije");
  const session = await getVncSessionService(sessionId);
  res.json({
    id: session.id,
    status: session.status,
    consentStatus: session.consentStatus,
  });
}

// Agent (agent auth) — reports the outcome of the consent dialog.
export async function recordVncConsentController(req, res) {
  const sessionId = parseIdParam(req, "sessionId", "ID sesije");

  const parsed = VncConsentSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const session = await recordVncConsentService(sessionId, req.agent.id, parsed.data);
  res.json(session);
}
