import { CreateGroupSchema } from "../dtos/groups.dto.js";
import { listGroupsService, createGroupService } from "../services/groups.service.js";
import { badRequest } from "../utils/httpError.js";

export async function listGroupsController(req, res) {
  const out = await listGroupsService();
  res.json(out);
}

export async function createGroupController(req, res) {
  const parsed = CreateGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await createGroupService(parsed.data.name);
  res.status(201).json(out);
}
