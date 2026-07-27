import { toInt, clamp } from "../utils/numbers.js";
import {
  getLiveServerHealthService,
  listServerHealthHistoryService,
} from "../services/serverHealth.service.js";
import {
  auditGhostReferencesService,
  cleanGhostReferencesService,
} from "../services/dbCleanup.service.js";

export async function getLiveServerHealthController(req, res) {
  const out = await getLiveServerHealthService();
  res.json(out);
}

export async function listServerHealthHistoryController(req, res) {
  const hours = clamp(toInt(req.query.hours, 24), 1, 24 * 30);
  const out = await listServerHealthHistoryService(hours);
  res.json(out);
}

export async function auditGhostReferencesController(req, res) {
  const out = await auditGhostReferencesService();
  res.json(out);
}

export async function cleanGhostReferencesController(req, res) {
  const out = await cleanGhostReferencesService();
  res.json(out);
}
