import { listGroups, insertGroup } from "../repositories/groups.repo.js";
import { conflict } from "../utils/httpError.js";

export async function listGroupsService() {
  return await listGroups();
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
