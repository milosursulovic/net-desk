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

// Admin (JWT) — frontend poll-uje status dok ceka pristanak korisnika (da
// prepozna 'rejected' i prestane da pokusava konekciju).
export async function getVncSessionController(req, res) {
  const sessionId = parseIdParam(req, "sessionId", "ID sesije");
  const session = await getVncSessionService(sessionId);
  res.json(session);
}

// Agent (agent auth) — prijava ishoda prozora za pristanak.
export async function recordVncConsentController(req, res) {
  const sessionId = parseIdParam(req, "sessionId", "ID sesije");

  const parsed = VncConsentSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const session = await recordVncConsentService(sessionId, req.agent.id, parsed.data);
  res.json(session);
}
