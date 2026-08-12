import { CreateGroupSchema } from "../dtos/groups.dto.js";
import {
  listGroupsService,
  createGroupService,
  listGroupsWithUsageService,
  deleteGroupService,
} from "../services/groups.service.js";
import { badRequest } from "../utils/httpError.js";

export async function listGroupsController(req, res) {
  const out = await listGroupsService();
  res.json(out);
}

export async function listGroupsUsageController(req, res) {
  const out = await listGroupsWithUsageService();
  res.json(out);
}

export async function createGroupController(req, res) {
  const parsed = CreateGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await createGroupService(parsed.data.name);
  res.status(201).json(out);
}

export async function deleteGroupController(req, res) {
  const name = String(req.params.name || "").trim();
  if (!name) throw badRequest("Naziv grupe je obavezan");

  await deleteGroupService(name);
  res.status(204).send();
}
