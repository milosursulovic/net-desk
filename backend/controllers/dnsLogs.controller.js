import { listDnsQueriesService } from "../services/dnsLogs.service.js";
import { SITES } from "../dtos/ipAddresses.dto.js";

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function listDnsQueriesController(req, res) {
  const out = await listDnsQueriesService({
    ...req.query,
    site: siteFilter(req.query.site),
  });
  res.json(out);
}
