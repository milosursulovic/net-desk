import { downloadFileFromAgentService } from "../services/fileTransfer.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

export async function downloadFileFromAgentController(req, res) {
  const agentId = parseIdParam(req, "id", "ID agenta");
  const sessionId = parseIdParam(req, "sessionId", "ID sesije");
  const filePath = String(req.query.path || "");
  if (!filePath) throw badRequest("Nedostaje putanja fajla.");

  await downloadFileFromAgentService(agentId, sessionId, filePath, req.user, res);
}
