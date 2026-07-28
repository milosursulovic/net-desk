import {
  startVncSessionService,
  endVncSessionService,
} from "../services/vncSessions.service.js";
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
