import { pool } from "../db/pool.js";

export async function insertVncSession({ agentId, requestedByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO vnc_sessions (agent_id, requested_by_user_id, status)
    VALUES (?, ?, 'pending')
    `,
    [agentId, requestedByUserId],
  );
  return result.insertId;
}

const SELECT_FIELDS = `
  id,
  agent_id AS agentId,
  requested_by_user_id AS requestedByUserId,
  status,
  started_at AS startedAt,
  ended_at AS endedAt
`;

export async function findVncSessionById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM vnc_sessions WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows?.[0] || null;
}

export async function markVncSessionActive(id) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET status = 'active' WHERE id = ? AND status = 'pending'`,
    [id],
  );
  return result.affectedRows;
}

export async function markVncSessionEnded(id) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET status = 'ended', ended_at = NOW() WHERE id = ? AND status != 'ended'`,
    [id],
  );
  return result.affectedRows;
}
