import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Za razliku od insertEventLogsBulk (INSERT IGNORE - event logovi su
// append-only distinktni redovi), DNS upiti se agregiraju PO (ip_entry_id,
// domain) - broj distinktnih domena po računaru je ograničen (hiljade
// tokom meseci), dok bi jedan red po pojedinačnom upitu (desetine hiljada
// dnevno po mašini) neograničeno rastao. UNIQUE KEY na (ip_entry_id,
// domain) čini ovo idempotentnim - agent koji ponovo pošalje isti batch
// posle prekinute veze samo dodaje na postojeći count, ne duplira.
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

export async function listDnsQueries({ search, site, page, limit, sortBy, sortOrder }) {
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
      EXISTS (
        SELECT 1 FROM flagged_domains fd
        WHERE cdq.domain = fd.domain OR cdq.domain LIKE CONCAT('%.', fd.domain)
      ) AS isBlacklisted
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
// Crna lista domena (flagged_domains) - isti CRUD obrazac kao
// flagged.repo.js (software/services), ali smešten ovde (ne u flagged.repo.js)
// jer je namerno admin-only (isto kao DNS logovi sami), ne operator-writable
// kao flagged_software/flagged_services.
// =========================

export async function listFlaggedDomains(search) {
  const { where, params } = buildLikeSearch(["domain"], search);
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      domain,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_domains
    ${where ? `WHERE ${where}` : ""}
    ORDER BY domain
    `,
    params,
  );
  return rows;
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
