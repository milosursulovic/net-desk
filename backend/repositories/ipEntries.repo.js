import { pool } from "../db/pool.js";

function buildFastSearchSql(raw = "") {
    const q = String(raw || "").trim().toLowerCase();
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
        or.push("LOWER(COALESCE(username,'')) LIKE ?");
        params.push(likePrefix);
        or.push("LOWER(COALESCE(department,'')) LIKE ?");
        params.push(likePrefix);

        chunks.push(`(${or.join(" OR ")})`);
    }

    return { where: chunks.length ? chunks.join(" AND ") : "", params };
}

function buildLegacySearchSql(search = "") {
    const s = String(search || "").trim();
    if (!s) return { where: "", params: [] };
    const like = `%${s}%`;
    const where = `(
    ip LIKE ? OR
    computer_name LIKE ? OR
    username LIKE ? OR
    full_name LIKE ? OR
    rdp LIKE ? OR
    rdp_app LIKE ? OR
    os LIKE ? OR
    department LIKE ? OR
    heliant_installed LIKE ?
  )`;
    return { where, params: [like, like, like, like, like, like, like, like, like] };
}

export async function findIpEntryById(id) {
    const [rows] = await pool.execute(
        `
    SELECT
      id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      username,
      password,
      full_name AS fullName,
      rdp,
      rdp_app AS rdpApp,
      os,
      department,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      created_at AS createdAt,
      updated_at AS updatedAt,
      heliant_installed AS heliantInstalled
    FROM ip_entries
    WHERE id = ?
    LIMIT 1
    `,
        [id]
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
      username,
      full_name AS fullName,
      rdp,
      rdp_app AS rdpApp,
      os,
      department,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      heliant_installed AS heliantInstalled
    FROM ip_entries
    WHERE id = ?
    LIMIT 1
    `,
        [id]
    );
    return rows?.[0] || null;
}

export async function findIpEntryIdByIp(ip) {
    const [[row]] = await pool.execute(
        `SELECT id FROM ip_entries WHERE ip = ? LIMIT 1`,
        [ip]
    );
    return row?.id ?? null;
}

export async function insertIpEntry(row) {
    const [result] = await pool.execute(
        `
    INSERT INTO ip_entries
      (ip, ip_numeric, computer_name, username, full_name, password, rdp, rdp_app, os, department, heliant_installed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
            row.ip,
            row.ipNumeric,
            row.computerName,
            row.username,
            row.fullName,
            row.password,
            row.rdp,
            row.rdpApp,
            row.os,
            row.department,
            row.heliantInstalled,
        ]
    );
    return result.insertId;
}

export async function updateIpEntryPatch(id, setsSql, params) {
    const [result] = await pool.execute(
        `UPDATE ip_entries SET ${setsSql} WHERE id = ?`,
        [...params, id]
    );
    return result.affectedRows;
}

export async function deleteIpEntry(id) {
    const [result] = await pool.execute(`DELETE FROM ip_entries WHERE id = ?`, [id]);
    return result.affectedRows;
}

export async function listIpEntries({ search, page, limit, sortBy, sortOrder, status }) {
    const base = buildFastSearchSql(search || "");

    const whereBaseParts = [];
    const baseParams = [];
    if (base.where) {
        whereBaseParts.push(base.where);
        baseParams.push(...base.params);
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

    const sortMap = {
        ip: "ip_numeric",
        computerName: "computer_name",
        username: "username",
        fullName: "full_name",
        rdp: "rdp",
        rdpApp: "rdp_app",
        os: "os",
        department: "department",
        heliantInstalled: "heliant_installed",
    };

    const safeSort = sortMap[sortBy] || "ip_numeric";
    const dir = sortOrder === "desc" ? "DESC" : "ASC";

    const sqlEntries = `
    SELECT
      id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      username,
      password,
      full_name AS fullName,
      rdp,
      rdp_app AS rdpApp,
      os,
      department,
      metadata_id AS metadata,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      heliant_installed AS heliantInstalled
    FROM ip_entries
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

    const [
        [totalRows],
        [onlineRows],
        [offlineRows],
    ] = await Promise.all([
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
    const safePage = totalPages === 0 ? 1 : Math.max(1, Math.min(page, totalPages));
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
        params
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
        username,
        department,
        updated_at AS updatedAt,
        heliant_installed as heliantInstalled
      FROM ip_entries
      WHERE LOWER(TRIM(computer_name)) = ?
      ORDER BY ip_numeric ASC
      `,
            [g.compKey]
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
      username,
      full_name AS fullName,
      rdp,
      rdp_app AS rdpApp,
      os,
      department,
      metadata_id AS metadataId,
      heliant_installed AS heliantInstalled
    FROM ip_entries
    ${whereSql}
    ORDER BY ip_numeric ASC
    `,
        leg.params
    );

    return entries || [];
}
