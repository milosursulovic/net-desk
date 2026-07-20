import { pool } from "../db/pool.js";

export async function insertEventLogsBulk(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.log_name,
    item.level,
    item.source,
    item.event_id,
    item.message,
    item.logged_at,
  ]);

  await pool.query(
    `
    INSERT IGNORE INTO computer_event_logs
    (
      ip_entry_id,
      log_name,
      level,
      source,
      event_id,
      message,
      logged_at
    )
    VALUES ?
    `,
    [values],
  );
}

export async function listEventLogs({ ipEntryId, logName, level, limit, offset }) {
  const whereParts = ["ip_entry_id = ?"];
  const params = [ipEntryId];

  if (logName === "System" || logName === "Application" || logName === "Security") {
    whereParts.push("log_name = ?");
    params.push(logName);
  }
  if (level) {
    whereParts.push("level = ?");
    params.push(level);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM computer_event_logs ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      log_name,
      level,
      source,
      event_id,
      message,
      logged_at,
      received_at
    FROM computer_event_logs
    ${whereSql}
    ORDER BY logged_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}
