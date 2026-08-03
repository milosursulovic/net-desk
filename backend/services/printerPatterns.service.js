import {
  listIgnoredPrinterPatterns,
  findIgnoredPrinterPatternMatch,
  insertIgnoredPrinterPattern,
  deleteIgnoredPrinterPattern,
} from "../repositories/printerPatterns.repo.js";
import { badRequest } from "../utils/httpError.js";

export async function listIgnoredPrinterPatternsService(search) {
  return await listIgnoredPrinterPatterns(search);
}

export async function addIgnoredPrinterPatternService({ pattern, reason }, userId) {
  const normalized = String(pattern || "").trim().toLowerCase();
  const existing = await findIgnoredPrinterPatternMatch(normalized);
  if (existing) {
    throw badRequest("Ovaj obrazac je već na listi ignorisanih štampača");
  }
  const id = await insertIgnoredPrinterPattern({ pattern: normalized, reason, createdByUserId: userId });
  return { id, pattern: normalized, reason };
}

export async function removeIgnoredPrinterPatternService(id) {
  const affected = await deleteIgnoredPrinterPattern(id);
  return { affected };
}
