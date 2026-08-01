import { pool } from "../db/pool.js";

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

  if (search) {
    whereParts.push("cdq.domain LIKE ?");
    params.push(`%${search}%`);
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
      ie.site
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
