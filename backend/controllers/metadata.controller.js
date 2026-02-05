import { toInt, clamp } from "../utils/numbers.js";
import {
  listMetadataPage,
  statsService,
} from "../services/metadata.service.js";

export async function listMetadataController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 1000);

  const out = await listMetadataPage({ page, limit });
  res.json(out);
}

export async function statsController(req, res) {
  const includeMeta =
    String(req.query.includeMeta || "").toLowerCase() === "true";
  const out = await statsService(includeMeta);
  res.json(out);
}
