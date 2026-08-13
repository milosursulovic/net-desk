import { CreateDeploymentGroupSchema } from "../dtos/deploymentGroups.dto.js";
import {
  listDeploymentGroupsService,
  createDeploymentGroupService,
  listDeploymentGroupsWithUsageService,
  deleteDeploymentGroupService,
} from "../services/deploymentGroups.service.js";
import { badRequest } from "../utils/httpError.js";

export async function listDeploymentGroupsController(req, res) {
  const out = await listDeploymentGroupsService();
  res.json(out);
}

export async function listDeploymentGroupsUsageController(req, res) {
  const out = await listDeploymentGroupsWithUsageService();
  res.json(out);
}

export async function createDeploymentGroupController(req, res) {
  const parsed = CreateDeploymentGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await createDeploymentGroupService(parsed.data.name);
  res.status(201).json(out);
}

export async function deleteDeploymentGroupController(req, res) {
  const name = String(req.params.name || "").trim();
  if (!name) throw badRequest("Naziv grupe je obavezan");

  await deleteDeploymentGroupService(name);
  res.status(204).send();
}
