import { ManagerEnrollSchema, ManagerHeartbeatSchema } from "../dtos/managers.dto.js";
import { enrollManager, heartbeatManager } from "../services/managers.service.js";
import { badRequest } from "../utils/httpError.js";

export async function enrollController(req, res) {
  const parsed = ManagerEnrollSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const result = await enrollManager(parsed.data);
  res.status(201).json(result);
}

export async function heartbeatController(req, res) {
  const parsed = ManagerHeartbeatSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await heartbeatManager(req.manager.id, parsed.data, req.ip);
  res.json(out);
}
