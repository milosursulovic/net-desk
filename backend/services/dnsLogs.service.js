import {
  upsertDnsQueriesBulk,
  listDnsQueries,
  listFlaggedDomains,
  findFlaggedDomainMatch,
  insertFlaggedDomain,
  deleteFlaggedDomain,
} from "../repositories/dnsLogs.repo.js";
import { paginate } from "../utils/pagination.js";
import { badRequest } from "../utils/httpError.js";

export async function ingestDnsQueries(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries
    .map((item) => {
      const domain = String(item.domain || "").trim().toLowerCase();
      if (!domain) return null;

      // new Date(...) on purpose, not a raw string - the agent sends ISO 8601 with
      // 7 fractional-second digits and a "Z" suffix (C#'s DateTime.ToString("o")),
      // which MySQL DATETIME rejects directly ("Incorrect datetime value" -
      // the Z suffix is never accepted, and neither are >6 decimals). new Date()
      // parses that string correctly into a JS Date object, which mysql2 then
      // serializes correctly into MySQL's format on its own.
      const firstSeen = item.firstSeen ? new Date(item.firstSeen) : new Date();
      const lastSeen = item.lastSeen ? new Date(item.lastSeen) : new Date();

      return {
        ip_entry_id: ipEntryId,
        domain,
        first_seen: isNaN(firstSeen) ? new Date() : firstSeen,
        last_seen: isNaN(lastSeen) ? new Date() : lastSeen,
        query_count: Number(item.count) > 0 ? Number(item.count) : 1,
      };
    })
    .filter(Boolean);

  await upsertDnsQueriesBulk(rows);
  return true;
}

// sortBy is interpolated directly into ORDER BY in the repo (a column can't be
// a bound parameter) - this whitelist IS the SQL injection protection, same
// pattern as inventory.dto.js's SORT_FIELDS. Never pass an
// unvalidated sortBy on to the repo.
const SORT_FIELDS = {
  domain: "cdq.domain",
  firstSeen: "cdq.first_seen",
  lastSeen: "cdq.last_seen",
  queryCount: "cdq.query_count",
  computerName: "ie.computer_name",
};

export async function listDnsQueriesService(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const search = String(query.search || "").trim();
  const site = query.site;
  const ipEntryIdNum = Number(query.ipEntryId);
  const ipEntryId = Number.isInteger(ipEntryIdNum) && ipEntryIdNum > 0 ? ipEntryIdNum : undefined;
  const blacklistedOnly = query.blacklistedOnly === true || query.blacklistedOnly === "true";

  const sortBy = SORT_FIELDS[query.sortBy] || SORT_FIELDS.lastSeen;
  const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";

  const { items, total } = await listDnsQueries({
    search,
    site,
    ipEntryId,
    blacklistedOnly,
    page,
    limit,
    sortBy,
    sortOrder,
  });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  // Boolean(...) on purpose - EXISTS(...) in the repo returns mysql2's raw
  // 0/1 value, not a real JSON boolean.
  const mappedItems = items.map((item) => ({ ...item, isBlacklisted: Boolean(item.isBlacklisted) }));

  return { items: mappedItems, page: safePage, limit, total, totalPages, search };
}

// =========================
// Domain blacklist - same dedup-on-insert pattern as flagged.service.js
// (software/services).
// =========================

export async function listFlaggedDomainsService({ search, page, limit }) {
  const { items, total } = await listFlaggedDomains({ search, page, limit });
  const { page: safePage, totalPages } = paginate({ page, limit, total });
  return { items, page: safePage, limit, total, totalPages };
}

export async function addFlaggedDomainService({ domain, reason }, userId) {
  const normalized = String(domain || "").trim().toLowerCase();
  const existing = await findFlaggedDomainMatch(normalized);
  if (existing) {
    throw badRequest("Ovaj domen je već na crnoj listi");
  }
  const id = await insertFlaggedDomain({ domain: normalized, reason, createdByUserId: userId });
  return { id, domain: normalized, reason };
}

export async function removeFlaggedDomainService(id) {
  const affected = await deleteFlaggedDomain(id);
  return { affected };
}
