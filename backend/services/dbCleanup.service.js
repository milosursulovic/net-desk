import {
  auditGhostReferences,
  cleanGhostReferences,
} from "../repositories/dbCleanup.repo.js";

export async function auditGhostReferencesService() {
  const results = await auditGhostReferences();
  const totalOrphans = results.reduce((sum, r) => sum + r.orphanCount, 0);
  return { results, totalOrphans };
}

export async function cleanGhostReferencesService() {
  const cleaned = await cleanGhostReferences();
  return { cleaned };
}
