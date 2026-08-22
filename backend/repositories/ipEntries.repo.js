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

  // department/os/rdpApp su sad multiselect na frontend-u - dto sloj
  // (ipAddresses.dto.js's multiValueFilter()) uvek normalizuje u niz
  // (prazan kad filter nije poslat), pa je "bar jedan izabran" = "IN
  // pogađa BILO KOJU od izabranih vrednosti", ne AND/presek.
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
    // rdp_app čuva SPOJEN string labela (npr. "AnyDesk, TeamViewer" - jedan
    // računar može imati do sve četiri) - contains-match po pojedinačnoj
    // labeli, ne exact-equals, pa se svaka izabrana vrednost svojim LIKE-om
    // ORuje (ne može se IN-ovati direktno). Vrednosti dolaze sa fiksnog
    // dropdown-a (RDP_APP_PATTERNS), ne slobodan tekst, pa nema potrebe za
    // escape-ovanjem LIKE wildcard karaktera.
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
  // "Nema Izvolte folder" grupiše potvrđeno odsutno (0) i nikad provereno
  // (NULL, npr. minimalni sync koji ne dodiruje ovo polje) - oba su isto
  // akciono stanje za admina.
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

// Kandidati za "preporuka za pakovanje" - računari na Windows 10/11 sa
// poznatim hardverom (JOIN na computer_metadata prirodno isključuje računare
// bez ijedne inventory sinhronizacije - nema CPU/RAM/disk podataka za njih).
// Klasifikacija slab CPU/malo RAM-a/HDD se radi u servisu (cpuTier.js +
// pragovi), ovaj upit samo vraća sirove specifikacije. Isti JOIN smer
// (cm.ip_entry_id = ie.id) kao statsRamTotals/statsLowRamRows u
// metadata.repo.js, ne preko ie.metadata_id. hasHdd je namerno STROŽE od
// "postoji bar jedan HDD" - okida SAMO kad računar ima TAČNO JEDAN disk i taj
// disk je HDD. Računar sa SSD+HDD (čest slučaj - SSD za OS, HDD za podatke)
// se NE flaguje, jer OS tada verovatno radi sa SSD-a i HDD nije usko grlo;
// dva HDD-a (bez SSD-a) se iz istog razloga (nejasan je koji disk je sistemski)
// takođe ne flaguju - samo najjednostavniji, nedvosmislen slučaj "jedan disk,
// taj disk je spor". media_type je 'HDD'/'SSD'/'Unspecified'/NULL
// (MsftMediaTypeToString u HardwareCollector.cs; NULL na Windows 7 gde
// MSFT_PhysicalDisk ne postoji, ali to je van dometa ovde jer je OS filter
// već Windows 10/11). hasLexarSsd je namerno DRUGAČIJE strogo od hasHdd -
// okida ako postoji BILO KOJI Lexar SSD, bez obzira na broj/vrstu ostalih
// diskova (za razliku od "jedan disk" pravila kod HDD-a) - Lexar SSD je sam
// po sebi red flag (poznati problemi sa pouzdanošću/otkazivanjem), isti
// kriterijum kao postojeći statsLexarFlagRows u metadata.repo.js
// (s.model LIKE '%lexar%' AND media_type LIKE '%SSD%'), ovde samo kao
// dodatni razlog za preporuku umesto posebne liste.
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
