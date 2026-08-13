import { FlagDomainSchema } from "../dtos/dnsLogs.dto.js";
import {
  listDnsQueriesService,
  listFlaggedDomainsService,
  addFlaggedDomainService,
  removeFlaggedDomainService,
} from "../services/dnsLogs.service.js";
import { SITES } from "../dtos/ipAddresses.dto.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";
import { toInt, clamp } from "../utils/numbers.js";

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

export async function listFlaggedDomainsController(req, res) {
  const search = String(req.query.search || "").trim();
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);
  const out = await listFlaggedDomainsService({ search, page, limit });
  res.json(out);
}

export async function createFlaggedDomainController(req, res) {
  const parsed = FlagDomainSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const created = await addFlaggedDomainService(parsed.data, req.user?.userId ?? null);
  res.status(201).json(created);
}

export async function deleteFlaggedDomainController(req, res) {
  const id = parseIdParam(req);
  await removeFlaggedDomainService(id);
  res.json({ success: true });
}
