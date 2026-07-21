import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Two intentionally different search implementations for the same concept:
// buildFastSearchSql (below) does prefix-matching so it can use the
// ip_numeric/computer_name indexes on the paginated list endpoint, which
// gets hit on every keystroke. buildLegacySearchSql does a plain
// contains-match LIKE across more columns (rdp_app/os too) - fine for the
// XLSX export path below, which runs once per click, not per keystroke.
const LEGACY_SEARCH_COLUMNS = [
  "ip",
  "computer_name",
  "rdp_app",
  "os",
  "department",
];

function buildFastSearchSql(raw = "") {
  const q = String(raw || "")
    .trim()
    .toLowerCase();
  if (!q) return { where: "", params: [] };

  const terms = q.split(/\s+/).slice(0, 3);
  const chunks = [];
  const params = [];

  for (const t of terms) {
    const likePrefix = `${t}%`;
    const ipPrefix = t.includes(".") ? `${t}%` : null;

    const or = [];
    if (ipPrefix) {
      or.push("ip LIKE ?");
      params.push(ipPrefix);
    }
    or.push("LOWER(COALESCE(computer_name,'')) LIKE ?");
    params.push(likePrefix);
    or.push("LOWER(COALESCE(department,'')) LIKE ?");
    params.push(likePrefix);

    chunks.push(`(${or.join(" OR ")})`);
  }

  return { where: chunks.length ? chunks.join(" AND ") : "", params };
}

function buildLegacySearchSql(search = "") {
  return buildLikeSearch(LEGACY_SEARCH_COLUMNS, search);
}

export async function findIpEntryById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      rdp_app AS rdpApp,
      os,
      remote_script AS remoteScript,
      department,
      entry_type AS entryType,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      created_at AS createdAt,
      updated_at AS updatedAt,
      description
    FROM ip_entries
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return rows?.[0] || null;
}

export async function findIpEntryByIdLean(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      rdp_app AS rdpApp,
      os,
      department,
      entry_type AS entryType,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange
    FROM ip_entries
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return rows?.[0] || null;
}

export async function findIpEntryIdByIp(ip) {
  const [[row]] = await pool.execute(
    `SELECT id FROM ip_entries WHERE ip = ? LIMIT 1`,
    [ip],
  );
  return row?.id ?? null;
}

export async function insertIpEntry(row) {
  const [result] = await pool.execute(
    `
    INSERT INTO ip_entries
      (ip, ip_numeric, computer_name, rdp_app, os, department, description, remote_script, entry_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.ip,
      row.ipNumeric,
      row.computerName,
      row.rdpApp,
      row.os,
      row.department,
      row.description,
      row.remoteScript,
      row.entryType ?? null,
    ],
  );
  return result.insertId;
}

export async function updateIpEntryPatch(id, setsSql, params) {
  const [result] = await pool.execute(
    `UPDATE ip_entries SET ${setsSql} WHERE id = ?`,
    [...params, id],
  );
  return result.affectedRows;
}

export async function deleteIpEntry(id) {
  const [result] = await pool.execute(`DELETE FROM ip_entries WHERE id = ?`, [
    id,
  ]);
  return result.affectedRows;
}

export async function listIpEntries({
  search,
  page,
  limit,
  sortBy,
  sortOrder,
  status,
  entryType,
  department,
  os,
}) {
  const base = buildFastSearchSql(search || "");

  const whereBaseParts = [];
  const baseParams = [];
  if (base.where) {
    whereBaseParts.push(base.where);
    baseParams.push(...base.params);
  }

  if (entryType === "computer" || entryType === "device") {
    whereBaseParts.push("entry_type = ?");
    baseParams.push(entryType);
  } else if (entryType === "unknown") {
    whereBaseParts.push("entry_type IS NULL");
  }

  if (department) {
    whereBaseParts.push("department = ?");
    baseParams.push(department);
  }

  if (os) {
    whereBaseParts.push("os = ?");
    baseParams.push(os);
  }

  const whereBaseSql = whereBaseParts.length
    ? `WHERE ${whereBaseParts.join(" AND ")}`
    : "";

  const whereListParts = [...whereBaseParts];
  const listParams = [...baseParams];

  if (status === "online") whereListParts.push("is_online = 1");
  if (status === "offline") whereListParts.push("is_online = 0");

  const whereListSql = whereListParts.length
    ? `WHERE ${whereListParts.join(" AND ")}`
    : "";

  // This map doubles as the SQL injection defense for the ORDER BY below -
  // the column name gets interpolated directly (can't be a bound param),
  // so any sortBy value not in this map falls back to ip_numeric rather
  // than ever reaching the query string.
  const sortMap = {
    ip: "ip_numeric",
    computerName: "computer_name",
    rdpApp: "rdp_app",
    os: "os",
    department: "department",
    remoteScript: "remote_script",
  };

  const safeSort = sortMap[sortBy] || "ip_numeric";
  const dir = sortOrder === "desc" ? "DESC" : "ASC";

  const sqlEntries = `
    SELECT
      ip_entries.id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      rdp_app AS rdpApp,
      os,
      department,
      entry_type AS entryType,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      remote_script AS remoteScript,
      description,
      agents.id AS agentId
    FROM ip_entries
    -- Assumes at most one active agent per ip_entry - if that's ever
    -- violated (e.g. re-enrollment leaves two active rows pointing at the
    -- same computer) this JOIN fans out and silently corrupts pagination
    -- counts/row order, not just agentId.
    LEFT JOIN agents ON agents.ip_entry_id = ip_entries.id AND agents.status = 'active'
    ${whereListSql}
    ORDER BY ${safeSort} ${dir}
    LIMIT ? OFFSET ?
  `;

  const sqlTotal = `
    SELECT COUNT(*) AS total
    FROM ip_entries
    ${whereListSql}
  `;

  const sqlOnline = `
    SELECT COUNT(*) AS cnt
    FROM ip_entries
    ${whereBaseSql ? whereBaseSql + " AND is_online = 1" : "WHERE is_online = 1"}
  `;

  const sqlOffline = `
    SELECT COUNT(*) AS cnt
    FROM ip_entries
    ${whereBaseSql ? whereBaseSql + " AND is_online = 0" : "WHERE is_online = 0"}
  `;

  const [[totalRows], [onlineRows], [offlineRows]] = await Promise.all([
    pool.execute(sqlTotal, listParams),
    pool.execute(sqlOnline, baseParams),
    pool.execute(sqlOffline, baseParams),
  ]);

  const toNum = (v) => {
    if (typeof v === "bigint") return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const total = toNum(totalRows?.[0]?.total);
  const onlineCount = toNum(onlineRows?.[0]?.cnt);
  const offlineCount = toNum(offlineRows?.[0]?.cnt);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage =
    totalPages === 0 ? 1 : Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;

  const [entriesRows] = await pool.execute(sqlEntries, [
    ...listParams,
    limit,
    offset,
  ]);

  return {
    entries: entriesRows,
    total,
    totalPages,
    page: safePage,
    limit,
    counts: { online: onlineCount, offline: offlineCount },
  };
}

export async function listDistinctDepartments() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT department FROM ip_entries WHERE department IS NOT NULL AND department != '' ORDER BY department`,
  );
  return rows.map((r) => r.department);
}

export async function listDistinctOs() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT os FROM ip_entries WHERE os IS NOT NULL AND os != '' ORDER BY os`,
  );
  return rows.map((r) => r.os);
}

export async function listComputersWithoutAgent({ search, page, limit }) {
  const searchClause = buildLikeSearch(["ip", "computer_name"], search, {
    prefixColumns: ["ip"],
  });

  const whereParts = [
    "e.entry_type = 'computer'",
    "NOT EXISTS (SELECT 1 FROM agents a WHERE a.ip_entry_id = e.id AND a.status = 'active')",
  ];
  const params = [];

  if (searchClause.where) {
    whereParts.push(searchClause.where);
    params.push(...searchClause.params);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM ip_entries e ${whereSql}`,
    params,
  );

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage = totalPages === 0 ? 1 : Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;

  const [entries] = await pool.execute(
    `
    SELECT
      e.id,
      e.ip,
      e.computer_name AS computerName,
      e.department,
      e.os,
      e.is_online AS isOnline,
      e.last_checked AS lastChecked
    FROM ip_entries e
    ${whereSql}
    ORDER BY e.ip_numeric ASC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { entries, total, totalPages, page: safePage, limit };
}

export async function duplicateComputerNameGroups({ search, status }) {
  const base = buildFastSearchSql(search || "");
  const whereParts = [];
  const params = [];

  if (base.where) {
    whereParts.push(base.where);
    params.push(...base.params);
  }

  if (status === "online") whereParts.push("is_online = 1");
  else if (status === "offline") whereParts.push("is_online = 0");

  whereParts.push("TRIM(COALESCE(computer_name,'')) <> ''");

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [groups] = await pool.execute(
    `
    SELECT
      LOWER(TRIM(computer_name)) AS compKey,
      MIN(computer_name) AS name,
      COUNT(*) AS count
    FROM ip_entries
    ${whereSql}
    GROUP BY compKey
    HAVING COUNT(*) > 1
    ORDER BY count DESC, name ASC
    LIMIT 500
    `,
    params,
  );

  const outGroups = [];
  let totalRows = 0;

  for (const g of groups) {
    const [items] = await pool.execute(
      `
      SELECT
        id,
        ip,
        computer_name AS computerName,
        department,
        updated_at AS updatedAt
      FROM ip_entries
      WHERE LOWER(TRIM(computer_name)) = ?
      ORDER BY ip_numeric ASC
      `,
      [g.compKey],
    );

    totalRows += Number(g.count) || 0;

    outGroups.push({
      key: g.compKey,
      name: g.name,
      count: Number(g.count) || items.length,
      items,
    });
  }

  return {
    totalDuplicateGroups: outGroups.length,
    totalDuplicateRows: totalRows,
    groups: outGroups,
  };
}

export async function exportIpEntriesForXlsx(search) {
  const leg = buildLegacySearchSql(search);
  const whereSql = leg.where ? `WHERE ${leg.where}` : "";

  const [entries] = await pool.execute(
    `
    SELECT
      ip,
      computer_name AS computerName,
      ip_numeric AS ipNumeric,
      rdp_app AS rdpApp,
      os,
      department,
      entry_type AS entryType,
      remote_script AS remoteScript,
      metadata_id AS metadataId,
      description
    FROM ip_entries
    ${whereSql}
    ORDER BY ip_numeric ASC
    `,
    leg.params,
  );

  return entries || [];
}
