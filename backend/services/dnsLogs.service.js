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

      // new Date(...) je namerno, ne sirov string - agent šalje ISO 8601 sa
      // 7 decimala sekunde i "Z" sufiksom (C#-ov DateTime.ToString("o")),
      // što MySQL DATETIME odbija direktno ("Incorrect datetime value" -
      // Z sufiks se nikad ne prihvata, a >6 decimala takođe ne). new Date()
      // parsira taj string ispravno u JS Date objekat, koji mysql2 zatim
      // sam ispravno serijalizuje u MySQL-ov format.
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

// sortBy interpoluje se direktno u ORDER BY u repo-u (kolona ne može biti
// bound parametar) - ova whitelist JESTE SQL injection zaštita, isti
// obrazac kao inventory.dto.js's SORT_FIELDS. Nikad ne prosleđivati
// nevalidiran sortBy dalje u repo.
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

  const sortBy = SORT_FIELDS[query.sortBy] || SORT_FIELDS.lastSeen;
  const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";

  const { items, total } = await listDnsQueries({
    search,
    site,
    page,
    limit,
    sortBy,
    sortOrder,
  });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  // Boolean(...) namerno - EXISTS(...) u repo-u vraća mysql2-ovu sirovu
  // 0/1 vrednost, ne pravi JSON boolean.
  const mappedItems = items.map((item) => ({ ...item, isBlacklisted: Boolean(item.isBlacklisted) }));

  return { items: mappedItems, page: safePage, limit, total, totalPages, search };
}

// =========================
// Crna lista domena - isti dedup-on-insert obrazac kao flagged.service.js
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
