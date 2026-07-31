import { pool } from "../db/pool.js";

export async function insertUpdateLog({ agentId, fromVersion, toVersion, success, reason }) {
  await pool.execute(
    `
    INSERT INTO agent_update_log
      (agent_id, from_version, to_version, success, reason)
    VALUES (?, ?, ?, ?, ?)
    `,
    [agentId, fromVersion, toVersion, success ? 1 : 0, reason],
  );
}

export async function listFailedUpdatesSince(since, limit = 20, site) {
  const [rows] = await pool.execute(
    `
    SELECT
      a.hostname,
      l.from_version AS fromVersion,
      l.to_version AS toVersion,
      l.reason,
      l.reported_at AS reportedAt
    FROM agent_update_log l
    JOIN agents a ON a.id = l.agent_id
    ${site ? "JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE l.success = 0 AND l.reported_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY l.reported_at DESC
    LIMIT ?
    `,
    [since, ...(site ? [site] : []), limit],
  );
  return rows;
}

export async function countFailedUpdatesSince(since, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_update_log l
    ${site ? "JOIN agents a ON a.id = l.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE l.success = 0 AND l.reported_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    `,
    [since, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

export async function listUpdateLogForAgent(agentId, { limit, offset }) {
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agent_update_log WHERE agent_id = ?`,
    [agentId],
  );

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      from_version AS fromVersion,
      to_version AS toVersion,
      success,
      reason,
      reported_at AS reportedAt
    FROM agent_update_log
    WHERE agent_id = ?
    ORDER BY reported_at DESC
    LIMIT ? OFFSET ?
    `,
    [agentId, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}
