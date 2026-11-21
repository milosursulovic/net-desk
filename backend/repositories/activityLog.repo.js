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

// Regex that recognizes the automatic HTTP audit entries (auditLog.middleware.js
// records "GET /api/..." as the action) - used to separate them from semantic
// events (login_*, vnc_*, ...).
const HTTP_ACTION_REGEXP = "^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ";

// Categories group the high-cardinality `action` string into meaningful buckets,
// so the audit trail (e.g. VNC consent) doesn't mix with general HTTP/login entries.
// '_' is escaped in LIKE ('vnc\_%') because '_' is a wildcard; MySQL's default
// escape character is backslash. Single place of definition - shared by the list and the export.
function categoryClause(category) {
  switch (category) {
    case "vnc":
      return { sql: "action LIKE 'vnc\\_%'", params: [] };
    case "auth":
      return { sql: "action LIKE 'login\\_%'", params: [] };
    case "requests":
      return { sql: "action REGEXP ?", params: [HTTP_ACTION_REGEXP] };
    case "other":
      return {
        sql: "(action NOT LIKE 'vnc\\_%' AND action NOT LIKE 'login\\_%' AND action NOT REGEXP ?)",
        params: [HTTP_ACTION_REGEXP],
      };
    default:
      return null; // "all"
  }
}

function buildWhere({ username, action, category, dateFrom, dateTo }) {
  const parts = [];
  const params = [];

  if (username) {
    parts.push("username LIKE ?");
    params.push(`%${username}%`);
  }
  if (action) {
    parts.push("action LIKE ?");
    params.push(`%${action}%`);
  }
  const cat = categoryClause(category);
  if (cat) {
    parts.push(cat.sql);
    params.push(...cat.params);
  }
  if (dateFrom) {
    parts.push("created_at >= ?");
    params.push(`${dateFrom} 00:00:00`);
  }
  if (dateTo) {
    parts.push("created_at <= ?");
    params.push(`${dateTo} 23:59:59`);
  }

  return { whereSql: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export async function listActivityLog({ limit, offset, username, action, category, dateFrom, dateTo }) {
  const { whereSql, params } = buildWhere({ username, action, category, dateFrom, dateTo });

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

// The export honors the same filters as the list, but without pagination. A hard
// cap guards against OOM when building the XLSX in memory (exceljs) on a very large
// table - returns the newest `cap` rows; the filters (category/date) narrow the result.
export async function fetchActivityLogForExport({ username, action, category, dateFrom, dateTo, cap = 100000 }) {
  const { whereSql, params } = buildWhere({ username, action, category, dateFrom, dateTo });

  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM activity_log
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    [...params, cap],
  );

  return rows;
}
