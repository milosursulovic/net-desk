import { listProcessDetectionsService } from "../services/processDetections.service.js";
import { SITES } from "../dtos/ipAddresses.dto.js";

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function listProcessDetectionsController(req, res) {
  const out = await listProcessDetectionsService({
    ...req.query,
    site: siteFilter(req.query.site),
  });
  res.json(out);
}
