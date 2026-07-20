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
