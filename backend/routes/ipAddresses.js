import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { pool } from "../index.js"; 
import { isValidIPv4, ipToNumeric } from "../utils/ip.js";
import { ah } from "../utils/asyncHandler.js";
import { z } from "zod";
import net from "net";
import tls from "tls";

const upload = multer({ storage: multer.memoryStorage() });

const PRIVATE_V4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;
const isPrivateIPv4 = (ip) => PRIVATE_V4.test(ip);

async function probeTCP(ip, port, timeoutMs = 100) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    let banner = "";
    let proto = "tcp";

    const finish = (ok, extra = {}) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve({
        ip,
        port,
        open: !!ok,
        rttMs: Date.now() - start,
        protocol: proto,
        serviceHint: null,
        banner: banner ? String(banner).slice(0, 800) : null,
        ...extra,
      });
    };

    socket.setTimeout(timeoutMs);

    socket.once("error", (err) => finish(false, { error: err?.code || String(err) }));
    socket.once("timeout", () => finish(false, { timeout: true }));

    socket.once("connect", () => {
      try {
        socket.setTimeout(600);
        socket.once("data", (buf) => {
          banner += buf.toString();
          finish(true);
        });

        if ([443, 8443, 9443, 6443].includes(port)) {
          proto = "tls";
          try {
            const tlsSock = tls.connect({
              socket,
              servername: ip,
              rejectUnauthorized: false,
            });
            tlsSock.setTimeout(1800);
            tlsSock.once("secureConnect", () => {
              const cert = tlsSock.getPeerCertificate?.() || {};
              banner = `TLS:${tlsSock.getProtocol() || "?"} · CN=${cert.subject?.CN || "?"}`;
              finish(true);
            });
            tlsSock.once("error", () => finish(true));
            tlsSock.once("timeout", () => finish(true));
            return;
          } catch {
            finish(true);
            return;
          }
        }

        if ([80, 8080, 8000, 8888].includes(port)) {
          socket.write(`HEAD / HTTP/1.0\r\nHost: ${ip}\r\n\r\n`);
          setTimeout(() => finish(true), 500);
          return;
        }

        if (port === 6379) {
          socket.write("*1\r\n$4\r\nPING\r\n");
          setTimeout(() => finish(true), 300);
          return;
        }

        setTimeout(() => finish(true), 500);
      } catch {
        finish(true);
      }
    });

    try {
      socket.connect(port, ip);
    } catch (e) {
      finish(false, { error: String(e) });
    }
  });
}

function parsePorts(str) {
  if (!str || String(str).trim() === "") {
    const full = [];
    for (let p = 1; p <= 65535; p++) full.push(p);
    return full;
  }
  const out = new Set();
  for (const seg of String(str).split(",").map((s) => s.trim()).filter(Boolean)) {
    if (seg.includes("-")) {
      const parts = seg.split("-").map((x) => parseInt(x.trim(), 10));
      if (parts.length === 2 && Number.isInteger(parts[0]) && Number.isInteger(parts[1])) {
        const a = Math.max(1, Math.min(65535, parts[0]));
        const b = Math.max(1, Math.min(65535, parts[1]));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let p = lo; p <= hi; p++) out.add(p);
      }
    } else {
      const p = parseInt(seg, 10);
      if (Number.isInteger(p) && p >= 1 && p <= 65535) out.add(p);
    }
  }
  const arr = Array.from(out).sort((x, y) => x - y);
  if (arr.length) return arr;
  const full = [];
  for (let p = 1; p <= 65535; p++) full.push(p);
  return full;
}

const ScanSchema = z.object({
  ip: z.string().refine(isValidIPv4, { message: "Neispravan IPv4" }),
  ports: z.string().optional(),
  timeoutMs: z.coerce.number().int().min(100).max(20000).optional().default(100),
  concurrency: z.coerce.number().int().min(1).max(1024).optional().default(64),
});

const router = express.Router();

function toInt(v, def = null) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

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
    system LIKE ? OR
    department LIKE ? OR
    heliant_installed ?
  )`;
  return { where, params: [like, like, like, like, like, like, like, like, like] };
}

const UpsertIpSchema = z.object({
  ip: z.string().refine(isValidIPv4, "Neispravan IPv4"),
  computerName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  rdp: z.string().nullable().optional(),
  rdpApp: z.string().nullable().optional(),
  system: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  heliantInstalled: z.string().nullable().optional()
});

const ListSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(10),
  sortBy: z
    .enum([
      "ip",
      "computerName",
      "username",
      "fullName",
      "rdp",
      "rdpApp",
      "system",
      "department",
      "heliantInstalled"
    ])
    .optional()
    .default("ip"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  status: z.enum(["all", "online", "offline"]).optional().default("all"),
});

router.get(
  "/scan-ports",
  ah(async (req, res) => {
    const q = ScanSchema.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues });

    const { ip, ports, timeoutMs, concurrency } = q.data;

    if (!isPrivateIPv4(ip)) {
      return res.status(400).json({
        error:
          "Skeniranje dozvoljeno samo za privatne IPv4 adrese (bez javnog skeniranja).",
      });
    }

    const portList = parsePorts(ports);
    const queue = [...portList];
    const results = [];
    let running = 0;

    await new Promise((resolve) => {
      const kick = () => {
        if (!queue.length && running === 0) return resolve();
        while (running < concurrency && queue.length) {
          const port = queue.shift();
          running++;
          probeTCP(ip, port, timeoutMs)
            .then((r) => results.push(r))
            .catch((err) => results.push({ ip, port, open: false, error: String(err) }))
            .finally(() => {
              running--;
              kick();
            });
        }
      };
      kick();
    });

    const open = results.filter((r) => r.open).sort((a, b) => a.port - b.port);
    res.json({ ip, scanned: results.length, openCount: open.length, open, raw: results });
  })
);

router.get(
  "/duplicates",
  ah(async (req, res) => {
    const parsed = ListSchema.parse(req.query);
    const { search, status } = parsed;

    const base = buildFastSearchSql(search || "");
    const whereParts = [];
    const params = [];

    if (base.where) {
      whereParts.push(base.where);
      params.push(...base.params);
    }

    if (status === "online") {
      whereParts.push("is_online = 1");
    } else if (status === "offline") {
      whereParts.push("is_online = 0");
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

    res.json({
      totalDuplicateGroups: outGroups.length,
      totalDuplicateRows: totalRows,
      groups: outGroups,
    });
  })
);

router.get(
  "/export-xlsx",
  ah(async (req, res) => {
    const search = String(req.query.search || "");
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
        system,
        department,
        metadata_id AS metadataId,
        heliant_installed AS heliantInstalled
      FROM ip_entries
      ${whereSql}
      ORDER BY ip_numeric ASC
      `,
      leg.params
    );

    const rows = entries.map((e) => ({
      ip: e.ip,
      computerName: e.computerName || "",
      username: e.username || "",
      fullName: e.fullName || "",
      rdp: e.rdp || "",
      rdpApp: e.rdpApp || "",
      system: e.system || "",
      department: e.department || "",
      hasMetadata: e.metadataId ? "DA" : "NE",
      heliantInstalled: e.heliantInstalled || ""
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        "ip",
        "computerName",
        "username",
        "fullName",
        "rdp",
        "rdpApp",
        "system",
        "department",
        "hasMetadata",
        "heliantInstalled"
      ],
      skipHeader: false,
    });

    ws["!cols"] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IP-Entries");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="ip-entries.xlsx"');
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  })
);

router.get(
  "/",
  ah(async (req, res) => {
    const parsed = ListSchema.parse(req.query);
    const { search, page, limit, sortBy, sortOrder, status } = parsed;

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
      system: "system",
      department: "department",
      heliantInstalled: "heliant_installed"
    };

    const safeSort = sortMap[sortBy] || "ip_numeric";
    const dir = sortOrder === "desc" ? "DESC" : "ASC";

    const safeLimit = clamp(limit, 1, 1000);

    const toNum = (v) => {
      if (typeof v === "bigint") return Number(v);
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

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
        system,
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

    const total = toNum(totalRows?.[0]?.total);
    const onlineCount = toNum(onlineRows?.[0]?.cnt);
    const offlineCount = toNum(offlineRows?.[0]?.cnt);

    const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);

    const safePage = totalPages === 0 ? 1 : clamp(page, 1, totalPages);
    const offset = (safePage - 1) * safeLimit;

    const [entriesRows] = await pool.execute(sqlEntries, [
      ...listParams,
      safeLimit,
      offset,
    ]);

    res.json({
      entries: entriesRows,
      total,
      totalPages,
      page: safePage,
      limit: safeLimit,
      counts: { online: onlineCount, offline: offlineCount },
    });
  })
);


router.get(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

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
        system,
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

    const entry = rows?.[0];
    if (!entry) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json(entry);
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const parsed = UpsertIpSchema.parse(req.body);

    const ip = parsed.ip;
    const ipNumeric = ipToNumeric(ip);

    const [result] = await pool.execute(
      `
      INSERT INTO ip_entries
        (ip, ip_numeric, computer_name, username, full_name, password, rdp, rdp_app, system, department, heliant_installed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ip,
        ipNumeric,
        emptyToNull(parsed.computerName),
        emptyToNull(parsed.username),
        emptyToNull(parsed.fullName),
        emptyToNull(parsed.password),
        emptyToNull(parsed.rdp),
        emptyToNull(parsed.rdpApp),
        emptyToNull(parsed.system),
        emptyToNull(parsed.department),
        emptyToNull(parsed.heliantInstalled),
      ]
    );

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
        system,
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
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  })
);


router.put(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

    const parsed = UpsertIpSchema.partial().parse(req.body);

    const sets = [];
    const params = [];

    if (parsed.ip !== undefined) {
      if (!isValidIPv4(parsed.ip)) return res.status(400).json({ message: "Neispravan IP" });
      sets.push("ip = ?");
      params.push(parsed.ip);
      sets.push("ip_numeric = ?");
      params.push(ipToNumeric(parsed.ip));
    }
    if (parsed.computerName !== undefined) { sets.push("computer_name = ?"); params.push(emptyToNull(parsed.computerName)); }
    if (parsed.username !== undefined) { sets.push("username = ?"); params.push(emptyToNull(parsed.username)); }
    if (parsed.fullName !== undefined) { sets.push("full_name = ?"); params.push(emptyToNull(parsed.fullName)); }
    if (parsed.password !== undefined) { sets.push("password = ?"); params.push(emptyToNull(parsed.password)); }
    if (parsed.rdp !== undefined) { sets.push("rdp = ?"); params.push(emptyToNull(parsed.rdp)); }
    if (parsed.rdpApp !== undefined) { sets.push("rdp_app = ?"); params.push(emptyToNull(parsed.rdpApp)); }
    if (parsed.system !== undefined) { sets.push("system = ?"); params.push(emptyToNull(parsed.system)); }
    if (parsed.department !== undefined) { sets.push("department = ?"); params.push(emptyToNull(parsed.department)); }
    if (parsed.heliantInstalled !== undefined) { sets.push("heliant_installed = ?"); params.push(emptyToNull(parsed.heliantInstalled)); }

    if (!sets.length) {
      return res.status(400).json({ message: "Nema polja za izmenu" });
    }

    params.push(id);

    const [result] = await pool.execute(
      `UPDATE ip_entries SET ${sets.join(", ")} WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Unos nije pronađen" });
    }

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
        system,
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

    res.json(rows[0]);
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

    const [result] = await pool.execute(`DELETE FROM ip_entries WHERE id = ?`, [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json({ message: "Unos obrisan" });
  })
);

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function parseDateMaybe(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v.$date) {
    const d = new Date(v.$date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
}

async function loadMetadataByIpEntryId(ipEntryId) {
  const [[meta]] = await pool.execute(
    `
    SELECT
      id,
      ip_entry_id AS ipEntryId,
      collected_at AS CollectedAt,
      computer_name AS ComputerName,
      user_name AS UserName,

      os_caption AS osCaption,
      os_version AS osVersion,
      os_build AS osBuild,
      os_install_date AS osInstallDate,

      system_manufacturer AS systemManufacturer,
      system_model AS systemModel,
      system_total_ram_gb AS systemTotalRamGb,

      mb_manufacturer AS mbManufacturer,
      mb_product AS mbProduct,
      mb_serial AS mbSerial,

      bios_vendor AS biosVendor,
      bios_version AS biosVersion,
      bios_release_date AS biosReleaseDate,

      cpu_name AS cpuName,
      cpu_cores AS cpuCores,
      cpu_logical_cpus AS cpuLogicalCpus,
      cpu_max_clock_mhz AS cpuMaxClockMHz,
      cpu_socket AS cpuSocket,

      psu AS PSU,

      created_at AS createdAt,
      updated_at AS updatedAt
    FROM computer_metadata
    WHERE ip_entry_id = ?
    LIMIT 1
    `,
    [ipEntryId]
  );

  if (!meta) return null;

  const [ram] = await pool.execute(
    `SELECT slot AS Slot, manufacturer AS Manufacturer, part_number AS PartNumber, serial AS Serial,
            capacity_gb AS CapacityGB, speed_mtps AS SpeedMTps, form_factor AS FormFactor
     FROM computer_metadata_ram_modules WHERE metadata_id = ?`,
    [meta.id]
  );

  const [storage] = await pool.execute(
    `SELECT model AS Model, serial AS Serial, firmware AS Firmware, size_gb AS SizeGB, media_type AS MediaType,
            bus_type AS BusType, device_id AS DeviceID
     FROM computer_metadata_storage WHERE metadata_id = ?`,
    [meta.id]
  );

  const [gpus] = await pool.execute(
    `SELECT name AS Name, driver_vers AS DriverVers, vram_gb AS VRAM_GB
     FROM computer_metadata_gpus WHERE metadata_id = ?`,
    [meta.id]
  );

  const [nics] = await pool.execute(
    `SELECT name AS Name, mac AS MAC, speed_mbps AS SpeedMbps
     FROM computer_metadata_nics WHERE metadata_id = ?`,
    [meta.id]
  );

  return {
    _sqlId: meta.id,
    ipEntry: ipEntryId,
    CollectedAt: meta.CollectedAt,
    ComputerName: meta.ComputerName,
    UserName: meta.UserName,

    OS: {
      Caption: meta.osCaption ?? null,
      Version: meta.osVersion ?? null,
      Build: meta.osBuild ?? null,
      InstallDate: meta.osInstallDate ?? null,
    },
    System: {
      Manufacturer: meta.systemManufacturer ?? null,
      Model: meta.systemModel ?? null,
      TotalRAM_GB: meta.systemTotalRamGb ?? null,
    },
    Motherboard: {
      Manufacturer: meta.mbManufacturer ?? null,
      Product: meta.mbProduct ?? null,
      Serial: meta.mbSerial ?? null,
    },
    BIOS: {
      Vendor: meta.biosVendor ?? null,
      Version: meta.biosVersion ?? null,
      ReleaseDate: meta.biosReleaseDate ?? null,
    },
    CPU: {
      Name: meta.cpuName ?? null,
      Cores: meta.cpuCores ?? null,
      LogicalCPUs: meta.cpuLogicalCpus ?? null,
      MaxClockMHz: meta.cpuMaxClockMHz ?? null,
      Socket: meta.cpuSocket ?? null,
    },
    RAMModules: ram || [],
    Storage: storage || [],
    GPUs: gpus || [],
    NICs: nics || [],
    PSU: meta.PSU ?? null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

async function upsertMetadataForIpEntry(ipEntryId, body) {
  const OS = pick(body, ["OS", "os"]) || {};
  const System = pick(body, ["System", "system"]) || {};
  const Motherboard = pick(body, ["Motherboard", "motherboard"]) || {};
  const BIOS = pick(body, ["BIOS", "bios"]) || {};
  const CPU = pick(body, ["CPU", "cpu"]) || {};

  const RAMModules = pick(body, ["RAMModules", "ramModules"]) || [];
  const Storage = pick(body, ["Storage", "storage"]) || [];
  const GPUs = pick(body, ["GPUs", "gpus"]) || [];
  const NICs = pick(body, ["NICs", "nics"]) || [];

  const collectedAt = parseDateMaybe(pick(body, ["CollectedAt", "collectedAt"]));
  const computerName = emptyToNull(pick(body, ["ComputerName", "computerName"]));
  const userName = emptyToNull(pick(body, ["UserName", "userName"]));
  const psu = emptyToNull(pick(body, ["PSU", "psu"]));

  const osCaption = emptyToNull(OS.Caption ?? OS.caption);
  const osVersion = emptyToNull(OS.Version ?? OS.version);
  const osBuild = emptyToNull(OS.Build ?? OS.build);
  const osInstallDate = parseDateMaybe(OS.InstallDate ?? OS.installDate);

  const systemManufacturer = emptyToNull(System.Manufacturer ?? System.manufacturer);
  const systemModel = emptyToNull(System.Model ?? System.model);
  const systemTotalRamGb = System.TotalRAM_GB ?? System.totalRamGb ?? System.totalRAM_GB ?? null;

  const mbManufacturer = emptyToNull(Motherboard.Manufacturer ?? Motherboard.manufacturer);
  const mbProduct = emptyToNull(Motherboard.Product ?? Motherboard.product);
  const mbSerial = emptyToNull(Motherboard.Serial ?? Motherboard.serial);

  const biosVendor = emptyToNull(BIOS.Vendor ?? BIOS.vendor);
  const biosVersion = emptyToNull(BIOS.Version ?? BIOS.version);
  const biosReleaseDate = parseDateMaybe(BIOS.ReleaseDate ?? BIOS.releaseDate);

  const cpuName = emptyToNull(CPU.Name ?? CPU.name);
  const cpuCores = CPU.Cores ?? CPU.cores ?? null;
  const cpuLogical = CPU.LogicalCPUs ?? CPU.logicalCPUs ?? null;
  const cpuMaxClock = CPU.MaxClockMHz ?? CPU.maxClockMHz ?? null;
  const cpuSocket = emptyToNull(CPU.Socket ?? CPU.socket);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.execute(
      `SELECT id FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
      [ipEntryId]
    );

    let metadataId;

    if (!existing) {
      const [ins] = await conn.execute(
        `
        INSERT INTO computer_metadata
          (ip_entry_id, collected_at, computer_name, user_name,
           os_caption, os_version, os_build, os_install_date,
           system_manufacturer, system_model, system_total_ram_gb,
           mb_manufacturer, mb_product, mb_serial,
           bios_vendor, bios_version, bios_release_date,
           cpu_name, cpu_cores, cpu_logical_cpus, cpu_max_clock_mhz, cpu_socket,
           psu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          ipEntryId,
          collectedAt,
          computerName,
          userName,
          osCaption,
          osVersion,
          osBuild,
          osInstallDate,
          systemManufacturer,
          systemModel,
          systemTotalRamGb,
          mbManufacturer,
          mbProduct,
          mbSerial,
          biosVendor,
          biosVersion,
          biosReleaseDate,
          cpuName,
          cpuCores,
          cpuLogical,
          cpuMaxClock,
          cpuSocket,
          psu,
        ]
      );

      metadataId = ins.insertId;

      await conn.execute(`UPDATE ip_entries SET metadata_id = ? WHERE id = ?`, [
        metadataId,
        ipEntryId,
      ]);
    } else {
      metadataId = existing.id;

      await conn.execute(
        `
        UPDATE computer_metadata SET
          collected_at = ?,
          computer_name = ?,
          user_name = ?,

          os_caption = ?,
          os_version = ?,
          os_build = ?,
          os_install_date = ?,

          system_manufacturer = ?,
          system_model = ?,
          system_total_ram_gb = ?,

          mb_manufacturer = ?,
          mb_product = ?,
          mb_serial = ?,

          bios_vendor = ?,
          bios_version = ?,
          bios_release_date = ?,

          cpu_name = ?,
          cpu_cores = ?,
          cpu_logical_cpus = ?,
          cpu_max_clock_mhz = ?,
          cpu_socket = ?,

          psu = ?
        WHERE id = ?
        `,
        [
          collectedAt,
          computerName,
          userName,

          osCaption,
          osVersion,
          osBuild,
          osInstallDate,

          systemManufacturer,
          systemModel,
          systemTotalRamGb,

          mbManufacturer,
          mbProduct,
          mbSerial,

          biosVendor,
          biosVersion,
          biosReleaseDate,

          cpuName,
          cpuCores,
          cpuLogical,
          cpuMaxClock,
          cpuSocket,

          psu,
          metadataId,
        ]
      );
    }


    await conn.execute(`DELETE FROM computer_metadata_ram_modules WHERE metadata_id = ?`, [
      metadataId,
    ]);
    for (const m of Array.isArray(RAMModules) ? RAMModules : []) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_ram_modules
          (metadata_id, slot, manufacturer, part_number, serial, capacity_gb, speed_mtps, form_factor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          metadataId,
          emptyToNull(m.Slot ?? m.slot),
          emptyToNull(m.Manufacturer ?? m.manufacturer),
          emptyToNull(m.PartNumber ?? m.partNumber),
          emptyToNull(m.Serial ?? m.serial),
          m.CapacityGB ?? m.capacityGB ?? null,
          m.SpeedMTps ?? m.speedMTps ?? null,
          emptyToNull(m.FormFactor ?? m.formFactor),
        ]
      );
    }

    await conn.execute(`DELETE FROM computer_metadata_storage WHERE metadata_id = ?`, [metadataId]);
    for (const s of Array.isArray(Storage) ? Storage : []) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_storage
          (metadata_id, model, serial, firmware, size_gb, media_type, bus_type, device_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          metadataId,
          emptyToNull(s.Model ?? s.model),
          emptyToNull(s.Serial ?? s.serial),
          emptyToNull(s.Firmware ?? s.firmware),
          s.SizeGB ?? s.sizeGB ?? null,
          emptyToNull(s.MediaType ?? s.mediaType),
          emptyToNull(s.BusType ?? s.busType),
          emptyToNull(s.DeviceID ?? s.deviceID),
        ]
      );
    }

    await conn.execute(`DELETE FROM computer_metadata_gpus WHERE metadata_id = ?`, [metadataId]);
    for (const g of Array.isArray(GPUs) ? GPUs : []) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_gpus
          (metadata_id, name, driver_vers, vram_gb)
        VALUES (?, ?, ?, ?)
        `,
        [
          metadataId,
          emptyToNull(g.Name ?? g.name),
          emptyToNull(g.DriverVers ?? g.driverVers),
          g.VRAM_GB ?? g.vram_gb ?? g.vramGb ?? null,
        ]
      );
    }

    await conn.execute(`DELETE FROM computer_metadata_nics WHERE metadata_id = ?`, [metadataId]);
    for (const n of Array.isArray(NICs) ? NICs : []) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_nics
          (metadata_id, name, mac, speed_mbps)
        VALUES (?, ?, ?, ?)
        `,
        [
          metadataId,
          emptyToNull(n.Name ?? n.name),
          emptyToNull(n.MAC ?? n.mac),
          n.SpeedMbps ?? n.speedMbps ?? null,
        ]
      );
    }

    await conn.commit();
    return await loadMetadataByIpEntryId(ipEntryId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

router.post(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const [[row]] = await pool.execute(`SELECT id FROM ip_entries WHERE ip = ? LIMIT 1`, [ip]);
    if (!row) return res.status(404).json({ error: "IpEntry not found" });

    const meta = await upsertMetadataForIpEntry(row.id, req.body || {});
    res.json(meta);
  })
);

router.get(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const [[row]] = await pool.execute(`SELECT id FROM ip_entries WHERE ip = ? LIMIT 1`, [ip]);
    if (!row) return res.status(404).json({ error: "Not found" });

    const meta = await loadMetadataByIpEntryId(row.id);
    if (!meta) return res.status(404).json({ error: "Metadata not found" });

    const [[ipEntry]] = await pool.execute(
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
        system,
        department,
        is_online AS isOnline,
        last_checked AS lastChecked,
        last_status_change AS lastStatusChange,
        heliant_installed AS heliantInstalled
      FROM ip_entries
      WHERE id = ?
      `,
      [row.id]
    );

    res.json({ ...ipEntry, metadata: meta });
  })
);

router.patch(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const [[row]] = await pool.execute(`SELECT id FROM ip_entries WHERE ip = ? LIMIT 1`, [ip]);
    if (!row) return res.status(404).json({ error: "IpEntry not found" });

    const existing = (await loadMetadataByIpEntryId(row.id)) || {};
    const merged = { ...existing, ...(req.body || {}) };

    for (const k of ["OS", "System", "Motherboard", "BIOS", "CPU"]) {
      if (req.body?.[k]) merged[k] = { ...(existing[k] || {}), ...(req.body[k] || {}) };
    }

    for (const k of ["RAMModules", "Storage", "GPUs", "NICs"]) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, k)) {
        merged[k] = existing[k] || [];
      }
    }

    const meta = await upsertMetadataForIpEntry(row.id, merged);
    if (!meta) return res.status(404).json({ error: "Metadata not found" });
    res.json(meta);
  })
);

export default router;

