import { ActivityLogQuerySchema } from "../dtos/activityLog.dto.js";
import { listActivityLogService } from "../services/activityLog.service.js";
import { badRequest } from "../utils/httpError.js";

export async function listActivityLogController(req, res) {
  const parsed = ActivityLogQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await listActivityLogService(parsed.data);
  res.json(out);
}
