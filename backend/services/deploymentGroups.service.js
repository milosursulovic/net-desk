import {
  listDeploymentGroups,
  insertDeploymentGroup,
  listDeploymentGroupsWithUsage,
  deleteDeploymentGroupByName,
} from "../repositories/deploymentGroups.repo.js";
import { conflict, notFound } from "../utils/httpError.js";

export async function listDeploymentGroupsService() {
  return await listDeploymentGroups();
}

export async function listDeploymentGroupsWithUsageService() {
  return await listDeploymentGroupsWithUsage();
}

export async function deleteDeploymentGroupService(name) {
  const all = await listDeploymentGroupsWithUsage();
  const usage = all.find((g) => g.name === name);
  if (!usage) {
    throw notFound("Deployment grupa nije pronađena");
  }
  const usedCount = usage.agentCount + usage.releaseCount;
  if (usedCount > 0) {
    throw conflict(
      `Deployment grupa "${name}" se koristi na ${usedCount} mesta (agent/release) - ne može se obrisati dok je u upotrebi.`,
    );
  }

  await deleteDeploymentGroupByName(name);
}

export async function createDeploymentGroupService(name) {
  try {
    await insertDeploymentGroup(name);
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      throw conflict("Deployment grupa sa tim imenom već postoji");
    }
    throw err;
  }
  return { name };
}
