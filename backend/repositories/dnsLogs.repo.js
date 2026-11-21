import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Matches cdq.domain against fd.domain when they're equal OR when cdq.domain
// is a subdomain of fd.domain (e.g. cdq="a.example.com" matches fd="example.com").
// Deliberately 6x EXISTS with OR instead of "EXISTS (... WHERE fd.domain IN (cdq.domain,
// SUBSTRING_INDEX(...), ...))" (the previous shape) - that IN shape was fast
// enough WHILE it was only used in the SELECT list (computed only for the
// ~50 LIMITed rows), but when the same expression was also used as a WHERE
// filter (blacklistedOnly - see listDnsQueries below), EXPLAIN showed that
// for the IN shape MariaDB does NOT do an indexed lookup per iteration, but a full
// scan of the whole uq_flagged_domain index FOR EVERY ROW of computer_dns_queries
// (DEPENDENT SUBQUERY, type=index, not ref/unique_subquery) - tested live
// with ~90k synthetic flagged_domains rows, the query didn't finish even after
// 120s. 6x EXISTS with equality (fd.domain = <a single expression>) per branch
// lets MariaDB MATERIALIZE each branch ONCE (a temp table with an index,
// built only once for the whole query, not per row) and then do an
// indexed lookup per row - the same result (verified identical match
// count), but a fundamentally different (and the only sustainable one at this
// scale) time complexity.
export const FLAGGED_DOMAIN_MATCH_SQL = `
  (
    EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = cdq.domain)
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -2))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -3))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -4))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -5))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -6))
  )
`;

// Unlike insertEventLogsBulk (INSERT IGNORE - event logs are append-only
// distinct rows), DNS queries are aggregated PER (ip_entry_id, domain) - the
// number of distinct domains per computer is bounded (thousands over months),
// while one row per individual query (tens of thousands per machine per day)
// would grow without bound. The UNIQUE KEY on (ip_entry_id, domain) makes this
// idempotent - an agent that resends the same batch after a dropped
// connection only adds to the existing count, it doesn't duplicate.
export async function upsertDnsQueriesBulk(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.domain,
    item.first_seen,
    item.last_seen,
    item.query_count,
  ]);

  await pool.query(
    `
    INSERT INTO computer_dns_queries
    (
      ip_entry_id,
      domain,
      first_seen,
      last_seen,
      query_count
    )
    VALUES ?
    ON DUPLICATE KEY UPDATE
      first_seen = LEAST(first_seen, VALUES(first_seen)),
      last_seen = GREATEST(last_seen, VALUES(last_seen)),
      query_count = query_count + VALUES(query_count)
    `,
    [values],
  );
}

export async function listDnsQueries({ search, site, ipEntryId, blacklistedOnly, page, limit, sortBy, sortOrder }) {
  const whereParts = [];
  const params = [];

  const { where: searchWhere, params: searchParams } = buildLikeSearch(
    ["cdq.domain", "ie.computer_name", "ie.ip", "ie.department"],
    search,
  );
  if (searchWhere) {
    whereParts.push(searchWhere);
    params.push(...searchParams);
  }
  if (site) {
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  if (ipEntryId) {
    // For the "DNS" tab on the Agent Detail page - query history ONLY for that
    // agent's computer, same pattern as the PDSU event log tab (fetched by
    // ipEntryId, not agentId - DNS data in the database is tied to ip_entries,
    // not to agents).
    whereParts.push("cdq.ip_entry_id = ?");
    params.push(ipEntryId);
  }
  if (blacklistedOnly) {
    // The same FLAGGED_DOMAIN_MATCH_SQL expression as the isBlacklisted column below -
    // one place defining "a match", not duplicated logic that could
    // drift apart.
    whereParts.push(FLAGGED_DOMAIN_MATCH_SQL);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.execute(
    `
    SELECT COUNT(*) AS total
    FROM computer_dns_queries cdq
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    ${whereSql}
    `,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      cdq.id,
      cdq.domain,
      cdq.first_seen AS firstSeen,
      cdq.last_seen AS lastSeen,
      cdq.query_count AS queryCount,
      ie.id AS ipEntryId,
      ie.ip,
      ie.computer_name AS computerName,
      ie.department,
      ie.site,
      ${FLAGGED_DOMAIN_MATCH_SQL} AS isBlacklisted
    FROM computer_dns_queries cdq
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    ${whereSql}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}

// =========================
// Domain blacklist (flagged_domains) - the same CRUD pattern as
// flagged.repo.js (software/services), but placed here (not in flagged.repo.js)
// because it is deliberately admin-only (just like the DNS logs themselves), not
// operator-writable like flagged_software/flagged_services.
// =========================

// Paginated - flagged_domains has ~88k rows since it started syncing daily
// with external sources (domainBlacklistSync.service.js); returning ALL of them
// at once rendered 88k <tr> elements on the DNS Logs page and made it
// sluggish (discovered live).
export async function listFlaggedDomains({ search, page, limit }) {
  const { where, params } = buildLikeSearch(["domain"], search);
  const whereSql = where ? `WHERE ${where}` : "";
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM flagged_domains ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      domain,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_domains
    ${whereSql}
    ORDER BY domain
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );
  return { items: rows, total: Number(total) || 0 };
}

export async function findFlaggedDomainMatch(domain) {
  const [rows] = await pool.execute(
    `SELECT id FROM flagged_domains WHERE LOWER(domain) = LOWER(?) LIMIT 1`,
    [domain],
  );
  return rows?.[0] || null;
}

export async function insertFlaggedDomain({ domain, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO flagged_domains (domain, reason, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [domain, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteFlaggedDomain(id) {
  const [result] = await pool.execute(`DELETE FROM flagged_domains WHERE id = ?`, [id]);
  return result.affectedRows;
}

// Bulk seeding from external sources (domainBlacklistSync.service.js) -
// INSERT IGNORE (the same uq_flagged_domain as the single insertFlaggedDomain
// above) means manually added/already existing domains are never overwritten
// or deleted, only new ones are added. Split into smaller batches (not one
// insert of tens of thousands of rows) to avoid the max_allowed_packet risk.
const BULK_INSERT_CHUNK_SIZE = 1000;

export async function bulkInsertFlaggedDomains(rows) {
  if (!rows.length) return 0;

  let affected = 0;
  for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BULK_INSERT_CHUNK_SIZE);
    const values = chunk.map((r) => [r.domain, r.reason ?? null]);
    const [result] = await pool.query(
      `INSERT IGNORE INTO flagged_domains (domain, reason) VALUES ?`,
      [values],
    );
    affected += result.affectedRows;
  }
  return affected;
}
