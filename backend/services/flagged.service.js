import {
  listFlaggedSoftware,
  findFlaggedSoftwareMatch,
  insertFlaggedSoftware,
  deleteFlaggedSoftware,
  listFlaggedServices,
  findFlaggedServiceMatch,
  insertFlaggedService,
  deleteFlaggedService,
} from "../repositories/flagged.repo.js";
import { badRequest } from "../utils/httpError.js";

export async function listFlaggedSoftwareService(search) {
  return await listFlaggedSoftware(search);
}

export async function addFlaggedSoftwareService({ displayName, publisher, reason }, userId) {
  const existing = await findFlaggedSoftwareMatch(displayName, publisher);
  if (existing) {
    throw badRequest("Ovaj program je već označen kao neželjen");
  }
  const id = await insertFlaggedSoftware({
    displayName,
    publisher,
    reason,
    createdByUserId: userId,
  });
  return { id, displayName, publisher, reason };
}

export async function removeFlaggedSoftwareService(id) {
  const affected = await deleteFlaggedSoftware(id);
  return { affected };
}

export async function listFlaggedServicesService(search) {
  return await listFlaggedServices(search);
}

export async function addFlaggedServiceService({ name, displayName, reason }, userId) {
  const existing = await findFlaggedServiceMatch(name);
  if (existing) {
    throw badRequest("Ovaj servis je već označen kao neželjen");
  }
  const id = await insertFlaggedService({ name, displayName, reason, createdByUserId: userId });
  return { id, name, displayName, reason };
}

export async function removeFlaggedServiceService(id) {
  const affected = await deleteFlaggedService(id);
  return { affected };
}
