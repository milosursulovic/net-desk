import { pool } from "../db/pool.js";

export async function insertStatusHistoryBulk(rows) {
  if (!rows.length) return;

  const values = rows.map((row) => [
    row.ip_entry_id,
    row.is_online ? 1 : 0,
    row.changed_at,
  ]);

  await pool.query(
    `
    INSERT INTO ip_status_history
    (ip_entry_id, is_online, changed_at)
    VALUES ?
    `,
    [values],
  );
}

export async function getStatusHistory(ipEntryId, limit = 200) {
  const [rows] = await pool.query(
    `
    SELECT
      is_online AS isOnline,
      changed_at AS changedAt
    FROM ip_status_history
    WHERE ip_entry_id = ?
    ORDER BY changed_at DESC
    LIMIT ?
    `,
    [ipEntryId, limit],
  );

  return rows;
}
