import {
  listGroups,
  insertGroup,
  listGroupsWithUsage,
  deleteGroupByName,
} from "../repositories/groups.repo.js";
import { conflict, notFound } from "../utils/httpError.js";

export async function listGroupsService() {
  return await listGroups();
}

export async function listGroupsWithUsageService() {
  return await listGroupsWithUsage();
}

export async function deleteGroupService(name) {
  const all = await listGroupsWithUsage();
  const usage = all.find((g) => g.name === name);
  if (!usage) {
    throw notFound("Grupa nije pronađena");
  }
  const usedCount = usage.departmentCount;
  if (usedCount > 0) {
    throw conflict(
      `Grupa "${name}" se koristi na ${usedCount} mesta (odeljenje) - ne može se obrisati dok je u upotrebi.`,
    );
  }

  await deleteGroupByName(name);
}

export async function createGroupService(name) {
  try {
    await insertGroup(name);
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      throw conflict("Grupa sa tim imenom već postoji");
    }
    throw err;
  }
  return { name };
}
