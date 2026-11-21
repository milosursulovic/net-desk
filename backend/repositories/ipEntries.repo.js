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
    // Live-discovered bug: the search "server sala" is split into the terms
    // ["server", "sala"] AND-ed together, and the department "Server sala" is NOT a
    // prefix match for "sala" (it's the SECOND word in the value) - without this extra
    // "% word%" branch, the second term would never match anything and the whole AND would fail.
    // A bit slower for that branch (a leading % can't use the index), but
    // department/computer_name are small enough that it doesn't matter.
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
      (ip, ip_numeric, computer_name, rdp_app, os, os_architecture, has_izvolte_folder, department, site, description, entry_type, trusted_root_cert_installed, intermediate_cert_installed, secure_dns_disabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      row.trustedRootCertInstalled === undefined || row.trustedRootCertInstalled === null ? null : (row.trustedRootCertInstalled ? 1 : 0),
      row.intermediateCertInstalled === undefined || row.intermediateCertInstalled === null ? null : (row.intermediateCertInstalled ? 1 : 0),
      row.secureDnsDisabled === undefined || row.secureDnsDisabled === null ? null : (row.secureDnsDisabled ? 1 : 0),
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
  missingIzvolteFolder,
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

  // department/os/rdpApp are now multiselects on the frontend - the dto layer
  // (ipAddresses.dto.js's multiValueFilter()) always normalizes to an array
  // (empty when the filter wasn't sent), so "at least one selected" = "IN
  // matches ANY of the selected values", not AND/intersection.
  if (department?.length) {
    whereBaseParts.push(`department IN (${department.map(() => "?").join(",")})`);
    baseParams.push(...department);
  }

  if (os?.length) {
    whereBaseParts.push(`os IN (${os.map(() => "?").join(",")})`);
    baseParams.push(...os);
  }

  if (osArchitecture) {
    whereBaseParts.push("os_architecture = ?");
    baseParams.push(osArchitecture);
  }

  if (rdpApp?.length) {
    // rdp_app stores a JOINED string of labels (e.g. "AnyDesk, TeamViewer" - one
    // computer can have all four) - a contains-match per individual label, not
    // exact-equals, so each selected value is OR-ed with its own LIKE (it can't
    // be IN-ed directly). Values come from a fixed dropdown (RDP_APP_PATTERNS),
    // not free text, so there's no need to escape LIKE wildcard characters.
    whereBaseParts.push(`(${rdpApp.map(() => "rdp_app LIKE ?").join(" OR ")})`);
    baseParams.push(...rdpApp.map((v) => `%${v}%`));
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
  // "No Izvolte folder" groups confirmed absent (0) and never checked
  // (NULL, e.g. a minimal sync that doesn't touch this field) - both are the same
  // actionable state for the admin.
  if (missingIzvolteFolder) whereListParts.push("(has_izvolte_folder = 0 OR has_izvolte_folder IS NULL)");

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
      -- NOT EXISTS(...exceptions...) po SVAKOM poklopljenom (cs,fs) paru -
      -- izuzetak je specifičan za JEDNO flagged_* pravilo na JEDNOM računaru,
      -- ne "isključi ceo brojač" - ako drugo pravilo i dalje pogađa isti
      -- softver, i dalje se broji. Isti princip kao pdsu.repo.js's
      -- matched_flagged_id i flagged.repo.js's findAgentIdsForFlagged*.
      (SELECT COUNT(*) FROM computer_software cs
       JOIN flagged_software fs
         ON LOWER(cs.display_name) LIKE CONCAT('%', LOWER(fs.display_name), '%')
        AND (fs.publisher IS NULL OR LOWER(cs.publisher) = LOWER(fs.publisher))
       WHERE cs.ip_entry_id = ip_entries.id
         AND NOT EXISTS (
           SELECT 1 FROM flagged_software_exceptions fse
           WHERE fse.flagged_software_id = fs.id AND fse.ip_entry_id = ip_entries.id
         )) AS flaggedSoftwareCount,
      (SELECT COUNT(*) FROM computer_services csv
       JOIN flagged_services fsv
         ON LOWER(csv.name) LIKE CONCAT('%', LOWER(fsv.name), '%')
       WHERE csv.ip_entry_id = ip_entries.id
         AND NOT EXISTS (
           SELECT 1 FROM flagged_services_exceptions fsve
           WHERE fsve.flagged_service_id = fsv.id AND fsve.ip_entry_id = ip_entries.id
         )) AS flaggedServiceCount,
      (SELECT COUNT(*) FROM computer_drivers cd
       JOIN flagged_drivers fd
         ON LOWER(cd.device_name) LIKE CONCAT('%', LOWER(fd.device_name), '%')
        AND (fd.driver_provider_name IS NULL OR LOWER(cd.driver_provider_name) = LOWER(fd.driver_provider_name))
       WHERE cd.ip_entry_id = ip_entries.id
         AND NOT EXISTS (
           SELECT 1 FROM flagged_drivers_exceptions fde
           WHERE fde.flagged_driver_id = fd.id AND fde.ip_entry_id = ip_entries.id
         )) AS flaggedDriverCount,
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

// Candidates for the "repack recommendation" - Windows 10/11 computers with
// known hardware (the JOIN on computer_metadata naturally excludes computers
// without a single inventory sync - there's no CPU/RAM/disk data for them).
// Classifying weak CPU/low RAM/HDD is done in the service (cpuTier.js +
// thresholds), this query only returns the raw specs. Same JOIN direction
// (cm.ip_entry_id = ie.id) as statsRamTotals/statsLowRamRows in
// metadata.repo.js, not via ie.metadata_id. hasHdd is deliberately STRICTER than
// "at least one HDD exists" - it fires ONLY when the computer has EXACTLY ONE disk
// and that disk is an HDD. A computer with SSD+HDD (a common case - SSD for the OS,
// HDD for data) is NOT flagged, because the OS then probably runs from the SSD and
// the HDD isn't the bottleneck; two HDDs (without an SSD) are likewise not flagged
// for the same reason (it's unclear which disk is the system disk) - only the
// simplest, unambiguous case "one disk, and that disk is slow". media_type is
// 'HDD'/'SSD'/'Unspecified'/NULL (MsftMediaTypeToString in HardwareCollector.cs;
// NULL on Windows 7 where MSFT_PhysicalDisk doesn't exist, but that's out of
// reach here since the OS filter is already Windows 10/11). hasLexarSsd is
// deliberately strict in a DIFFERENT way than hasHdd - it fires if there is ANY
// Lexar SSD, regardless of the number/type of the other disks (unlike the
// "one disk" rule for HDDs) - a Lexar SSD is a red flag by itself (known
// reliability/failure problems), the same criterion as the existing
// statsLexarFlagRows in metadata.repo.js (s.model LIKE '%lexar%' AND
// media_type LIKE '%SSD%'), here just as an additional reason for the
// recommendation instead of a separate list.
export async function listRepackCandidates(site) {
  const whereParts = [
    "ie.entry_type = 'computer'",
    "(ie.os LIKE '%Windows 10%' OR ie.os LIKE '%Windows 11%')",
  ];
  const params = [];
  if (site) {
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `
    SELECT
      ie.id,
      ie.ip,
      ie.computer_name AS computerName,
      ie.department,
      ie.site,
      ie.os,
      ie.pending_repack AS pendingRepack,
      cm.cpu_name AS cpuName,
      COALESCE(
        cm.system_total_ram_gb,
        (
          SELECT COALESCE(SUM(rm.capacity_gb), 0)
          FROM computer_metadata_ram_modules rm
          WHERE rm.metadata_id = cm.id
        )
      ) AS ramGb,
      (
        SELECT COUNT(*) = 1 AND MAX(UPPER(COALESCE(s.media_type, ''))) = 'HDD'
        FROM computer_metadata_storage s
        WHERE s.metadata_id = cm.id
      ) AS hasHdd,
      EXISTS (
        SELECT 1 FROM computer_metadata_storage s2
        WHERE s2.metadata_id = cm.id
          AND s2.model LIKE '%lexar%'
          AND UPPER(COALESCE(s2.media_type, '')) LIKE '%SSD%'
      ) AS hasLexarSsd
    FROM ip_entries ie
    JOIN computer_metadata cm ON cm.ip_entry_id = ie.id
    WHERE ${whereParts.join(" AND ")}
    ORDER BY ie.computer_name
    `,
    params,
  );
  return rows;
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

// For "free IP addresses" (ipAddresses.service.js's freeIpAddressesService)
// - only the numeric range, nothing else; the caller builds a Set from this to
// filter the generated list of all addresses in the range.
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

// Full (unpaginated) version of listComputersWithoutAgent - for the PDF export,
// which needs the complete list, not just the current page.
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

// site is DELIBERATELY ALWAYS applied (not optional) when given - duplicate names
// are checked PER SITE, not globally across the whole fleet, otherwise the same
// computer name at two different physical sites (e.g. "PC-01" at the hospital
// and "PC-01" at the health center) would constantly be falsely reported as a duplicate.
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
