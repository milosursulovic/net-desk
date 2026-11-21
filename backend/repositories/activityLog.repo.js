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

// Regex koji prepoznaje auto HTTP audit upise (auditLog.middleware.js belezi
// "GET /api/..." kao action) - koristi se da ih odvoji od semantickih
// dogadjaja (login_*, vnc_*, ...).
const HTTP_ACTION_REGEXP = "^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) ";

// Kategorije grupisu visoko-kardinalni `action` string u smislene grupe, da
// se audit (npr. VNC pristanak) ne mesa sa opstim HTTP/login upisima.
// Escape '_' u LIKE ('vnc\_%') jer je '_' wildcard; podrazumevani MySQL escape
// je backslash. Jedno mesto definicije - deli ga i lista i export.
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

// Export honori iste filtere kao lista, ali bez paginacije. Hard cap stiti
// od OOM-a pri gradnji XLSX-a u memoriji (exceljs) na vrlo velikoj tabeli -
// vraca najskorijih `cap` redova; filteri (kategorija/datum) suze rezultat.
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
