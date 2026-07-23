import { pool } from "../db/pool.js";

// Fire-and-forget from the caller's perspective (callers .catch() this, per
// auditLog.middleware.js) - a logging failure must never break the actual
// request it's describing.
export async function insertActivityLog({
  userId,
  username,
  action,
  ipAddress,
  statusCode,
  details,
}) {
  await pool.execute(
    `
    INSERT INTO activity_log (user_id, username, action, ip_address, status_code, details)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [userId ?? null, username ?? null, action, ipAddress ?? null, statusCode ?? null, details ?? null],
  );
}

const SELECT_FIELDS = `
  id,
  user_id AS userId,
  username,
  action,
  ip_address AS ipAddress,
  status_code AS statusCode,
  details,
  created_at AS createdAt
`;

export async function listActivityLog({ limit, offset, username, action }) {
  const whereParts = [];
  const params = [];

  if (username) {
    whereParts.push("username LIKE ?");
    params.push(`%${username}%`);
  }
  if (action) {
    whereParts.push("action LIKE ?");
    params.push(`%${action}%`);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM activity_log ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM activity_log
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}
