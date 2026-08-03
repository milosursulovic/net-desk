import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Isti obrazac kao computer_dns_queries (dnsLogs.repo.js) - agregat po
// (ip_entry_id, process_name), ne jedan red po svakoj periodičnoj proveri.
// detection_count raste preko vremena (koliko puta je ciklus zatekao proces
// živ), first_seen/last_seen prate opseg. UNIQUE KEY čini upsert idempotentnim.
export async function upsertProcessDetectionsBulk(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.process_name,
    item.first_seen,
    item.last_seen,
    item.detection_count,
  ]);

  await pool.query(
    `
    INSERT INTO computer_process_detections
    (
      ip_entry_id,
      process_name,
      first_seen,
      last_seen,
      detection_count
    )
    VALUES ?
    ON DUPLICATE KEY UPDATE
      first_seen = LEAST(first_seen, VALUES(first_seen)),
      last_seen = GREATEST(last_seen, VALUES(last_seen)),
      detection_count = detection_count + VALUES(detection_count)
    `,
    [values],
  );
}

export async function listProcessDetections({ search, site, page, limit, sortBy, sortOrder }) {
  const whereParts = [];
  const params = [];

  // Pretraga pokriva ime procesa I računar/IP/odeljenje od početka (ne
  // samo domen kao što je isprva bio slučaj kod DNS logova - tamo je
  // pretraga po hostname-u vraćala 0 rezultata jer je pokrivala samo
  // domain kolonu, iako su podaci postojali).
  const { where: searchWhere, params: searchParams } = buildLikeSearch(
    ["cpd.process_name", "ie.computer_name", "ie.ip", "ie.department"],
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
    FROM computer_process_detections cpd
    JOIN ip_entries ie ON ie.id = cpd.ip_entry_id
    ${whereSql}
    `,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      cpd.id,
      cpd.process_name AS processName,
      cpd.first_seen AS firstSeen,
      cpd.last_seen AS lastSeen,
      cpd.detection_count AS detectionCount,
      ie.id AS ipEntryId,
      ie.ip,
      ie.computer_name AS computerName,
      ie.department,
      ie.site
    FROM computer_process_detections cpd
    JOIN ip_entries ie ON ie.id = cpd.ip_entry_id
    ${whereSql}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}
