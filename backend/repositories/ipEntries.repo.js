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
    // Uživo otkriven bug: pretraga "server sala" cepa se na termine
    // ["server", "sala"] AND-ovane, a department "Server sala" NIJE prefiks
    // reči "sala" (to je DRUGA reč u vrednosti) - bez ovog dodatnog "% reč%"
    // ogranka, drugi termin nikad ne bi pogodio ništa i ceo AND bi pao.
    // Malo sporije za taj ogranak (vodeći % ne koristi indeks), ali
    // department/computer_name su dovoljno mali da to nije problem.
    const likeWordBoundary = `% ${t}%`;
    const ipPrefix = t.includes(".") ? `${t}%` : null;

    const or = [];
    if (ipPrefix) {
      or.push("ip LIKE ?");
      params.push(ipPrefix);
    }
    or.push("LOWER(COALESCE(computer_name,'')) LIKE ?");
    params.push(likePrefix);
    or.push("LOWER(COALESCE(computer_name,'')) LIKE ?");
    params.push(likeWordBoundary);
    or.push("LOWER(COALESCE(department,'')) LIKE ?");
    params.push(likePrefix);
    or.push("LOWER(COALESCE(department,'')) LIKE ?");
    params.push(likeWordBoundary);

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
      os_architecture AS osArchitecture,
      has_izvolte_folder AS hasIzvolteFolder,
      department,
      site,
      entry_type AS entryType,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      created_at AS createdAt,
      updated_at AS updatedAt,
      description,
      pending_repack AS pendingRepack
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
      site,
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
      (ip, ip_numeric, computer_name, rdp_app, os, os_architecture, has_izvolte_folder, department, site, description, entry_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.ip,
      row.ipNumeric,
      row.computerName,
      row.rdpApp,
      row.os,
      row.osArchitecture ?? null,
      row.hasIzvolteFolder ? 1 : 0,
      row.department,
      row.site ?? null,
      row.description,
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
  osArchitecture,
  rdpApp,
  site,
  pendingRepack,
  hasIzvolteFolder,
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

  if (osArchitecture) {
    whereBaseParts.push("os_architecture = ?");
    baseParams.push(osArchitecture);
  }

  if (rdpApp) {
    // rdp_app čuva SPOJEN string labela (npr. "AnyDesk, TeamViewer" - jedan
    // računar može imati do sve četiri) - contains-match po pojedinačnoj
    // labeli, ne exact-equals. Vrednosti dolaze sa fiksnog dropdown-a
    // (RDP_APP_PATTERNS), ne slobodan tekst, pa nema potrebe za escape-ovanjem
    // LIKE wildcard karaktera.
    whereBaseParts.push("rdp_app LIKE ?");
    baseParams.push(`%${rdpApp}%`);
  }

  if (site) {
    whereBaseParts.push("site = ?");
    baseParams.push(site);
  }

  const whereBaseSql = whereBaseParts.length
    ? `WHERE ${whereBaseParts.join(" AND ")}`
    : "";

  const whereListParts = [...whereBaseParts];
  const listParams = [...baseParams];

  if (status === "online") whereListParts.push("is_online = 1");
  if (status === "offline") whereListParts.push("is_online = 0");

  if (pendingRepack) whereListParts.push("pending_repack = 1");
  if (hasIzvolteFolder) whereListParts.push("has_izvolte_folder = 1");

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
      os_architecture AS osArchitecture,
      has_izvolte_folder AS hasIzvolteFolder,
      department,
      site,
      entry_type AS entryType,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      description,
      pending_repack AS pendingRepack,
      agents.id AS agentId,
      (SELECT COUNT(*) FROM computer_software cs
       JOIN flagged_software fs
         ON LOWER(cs.display_name) LIKE CONCAT('%', LOWER(fs.display_name), '%')
        AND (fs.publisher IS NULL OR LOWER(cs.publisher) = LOWER(fs.publisher))
       WHERE cs.ip_entry_id = ip_entries.id) AS flaggedSoftwareCount,
      (SELECT COUNT(*) FROM computer_services csv
       JOIN flagged_services fsv
         ON LOWER(csv.name) LIKE CONCAT('%', LOWER(fsv.name), '%')
       WHERE csv.ip_entry_id = ip_entries.id) AS flaggedServiceCount,
      (SELECT COUNT(*) FROM computer_drivers cd
       JOIN flagged_drivers fd
         ON LOWER(cd.device_name) LIKE CONCAT('%', LOWER(fd.device_name), '%')
        AND (fd.driver_provider_name IS NULL OR LOWER(cd.driver_provider_name) = LOWER(fd.driver_provider_name))
       WHERE cd.ip_entry_id = ip_entries.id) AS flaggedDriverCount,
      -- Isti obrazac poklapanja kao listComputersWithoutUltravnc() u
      -- pdsuAnalytics.repo.js (uvnc_service je stvarni naziv koji registruje
      -- Deploy-NetdeskVnc.ps1, ultravnc/winvnc su dodatni obrasci za
      -- starije/ručne instalacije) - držati oba mesta u sinhronizaciji.
      EXISTS(
        SELECT 1 FROM computer_services uvnc
        WHERE uvnc.ip_entry_id = ip_entries.id
          AND (
            LOWER(uvnc.name) LIKE '%uvnc%'
            OR LOWER(uvnc.name) LIKE '%ultravnc%'
            OR LOWER(uvnc.name) LIKE '%winvnc%'
          )
      ) AS hasUltravnc
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

  const sqlPendingRepack = `
    SELECT COUNT(*) AS cnt
    FROM ip_entries
    ${whereBaseSql ? whereBaseSql + " AND pending_repack = 1" : "WHERE pending_repack = 1"}
  `;

  const [[totalRows], [onlineRows], [offlineRows], [pendingRepackRows]] = await Promise.all([
    pool.execute(sqlTotal, listParams),
    pool.execute(sqlOnline, baseParams),
    pool.execute(sqlOffline, baseParams),
    pool.execute(sqlPendingRepack, baseParams),
  ]);

  const toNum = (v) => {
    if (typeof v === "bigint") return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const total = toNum(totalRows?.[0]?.total);
  const onlineCount = toNum(onlineRows?.[0]?.cnt);
  const offlineCount = toNum(offlineRows?.[0]?.cnt);
  const pendingRepackCount = toNum(pendingRepackRows?.[0]?.cnt);

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
    counts: { online: onlineCount, offline: offlineCount, pendingRepack: pendingRepackCount },
  };
}

export async function updatePendingRepack(id, value) {
  const [result] = await pool.execute(
    `UPDATE ip_entries SET pending_repack = ? WHERE id = ?`,
    [value ? 1 : 0, id],
  );
  return result.affectedRows;
}

export async function listDistinctDepartments(site) {
  const whereParts = ["department IS NOT NULL", "department != ''"];
  const params = [];
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT department FROM ip_entries WHERE ${whereParts.join(" AND ")} ORDER BY department`,
    params,
  );
  return rows.map((r) => r.department);
}

export async function listDistinctOs(site) {
  const whereParts = ["os IS NOT NULL", "os != ''"];
  const params = [];
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT os FROM ip_entries WHERE ${whereParts.join(" AND ")} ORDER BY os`,
    params,
  );
  return rows.map((r) => r.os);
}

export async function listDistinctOsArchitectures(site) {
  const whereParts = ["os_architecture IS NOT NULL", "os_architecture != ''"];
  const params = [];
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT os_architecture FROM ip_entries WHERE ${whereParts.join(" AND ")} ORDER BY os_architecture`,
    params,
  );
  return rows.map((r) => r.os_architecture);
}

export async function listIpEntriesCreatedSince(since, limit = 20, site) {
  const whereParts = ["created_at >= ?"];
  const params = [since];
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  params.push(limit);
  const [rows] = await pool.execute(
    `
    SELECT id, ip, computer_name AS computerName, department, created_at AS createdAt
    FROM ip_entries
    WHERE ${whereParts.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
    `,
    params,
  );
  return rows;
}

export async function countIpEntriesTotal(site) {
  const whereSql = site ? "WHERE site = ?" : "";
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries ${whereSql}`,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countIpEntriesCreatedSince(since, site) {
  const whereParts = ["created_at >= ?"];
  const params = [since];
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries WHERE ${whereParts.join(" AND ")}`,
    params,
  );
  return Number(cnt) || 0;
}

// Za "slobodne IP adrese" (ipAddresses.service.js's freeIpAddressesService)
// - samo numerički opseg, ništa drugo, pozivalac gradi Set od ovoga da
// filtrira generisanu listu svih adresa u opsegu.
export async function listIpNumericsInRange(minNumeric, maxNumeric) {
  const [rows] = await pool.execute(
    `SELECT ip_numeric AS ipNumeric FROM ip_entries WHERE ip_numeric BETWEEN ? AND ?`,
    [minNumeric, maxNumeric],
  );
  return rows.map((r) => r.ipNumeric);
}

export async function listComputersWithoutAgent({ search, page, limit, site }) {
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

  if (site) {
    whereParts.push("e.site = ?");
    params.push(site);
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

// Puna (nepaginirana) verzija listComputersWithoutAgent - za PDF export, gde
// treba kompletna lista, ne samo trenutna stranica.
export async function listAllComputersWithoutAgent(search, site) {
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

  if (site) {
    whereParts.push("e.site = ?");
    params.push(site);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

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
    `,
    params,
  );

  return entries;
}

// site je NAMERNO UVEK primenjen (ne opcion) kad je zadat - duplikat imena
// se gleda PO LOKACIJI, ne globalno preko cele flote, inače isto ime
// računara na dve različite fizičke lokacije (npr. "PC-01" u bolnici i
// "PC-01" u domu zdravlja) bi se stalno lažno prijavljivalo kao duplikat.
export async function duplicateComputerNameGroups({ search, status, site }) {
  const base = buildFastSearchSql(search || "");
  const whereParts = [];
  const params = [];

  if (base.where) {
    whereParts.push(base.where);
    params.push(...base.params);
  }

  if (status === "online") whereParts.push("is_online = 1");
  else if (status === "offline") whereParts.push("is_online = 0");

  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }

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
    const itemsWhereParts = ["LOWER(TRIM(computer_name)) = ?"];
    const itemsParams = [g.compKey];
    if (site) {
      itemsWhereParts.push("site = ?");
      itemsParams.push(site);
    }

    const [items] = await pool.execute(
      `
      SELECT
        id,
        ip,
        computer_name AS computerName,
        department,
        updated_at AS updatedAt
      FROM ip_entries
      WHERE ${itemsWhereParts.join(" AND ")}
      ORDER BY ip_numeric ASC
      `,
      itemsParams,
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

export async function exportIpEntriesForXlsx(search, site) {
  const leg = buildLegacySearchSql(search);
  const whereParts = [];
  const params = [...leg.params];
  if (leg.where) whereParts.push(leg.where);
  if (site) {
    whereParts.push("site = ?");
    params.push(site);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [entries] = await pool.execute(
    `
    SELECT
      ip,
      computer_name AS computerName,
      ip_numeric AS ipNumeric,
      rdp_app AS rdpApp,
      os,
      os_architecture AS osArchitecture,
      has_izvolte_folder AS hasIzvolteFolder,
      department,
      site,
      entry_type AS entryType,
      metadata_id AS metadataId,
      description
    FROM ip_entries
    ${whereSql}
    ORDER BY ip_numeric ASC
    `,
    params,
  );

  return entries || [];
}
