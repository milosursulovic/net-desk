import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";
import Printer from "../models/Printer.js";
import { setMetadataForIp } from "../services/ipEntryService.js";
import { isValidIPv4, ipToNumeric, numericToIp } from "../utils/ip.js";
import { ah } from "../utils/asyncHandler.js";
import { z } from "zod";

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 },
});

const buildFastSearch = (raw = "") => {
  const q = String(raw || "").trim();
  if (!q) return {};
  const qLc = q.toLowerCase();
  const terms = qLc.split(/\s+/).slice(0, 3);

  const orForTerm = (t) => {
    const ipPrefix = t.replace(/\./g, "\\.");
    return {
      $or: [
        { ip: { $regex: `^${ipPrefix}` } },
        { computerName_lc: { $regex: `^${t}` } },
        { username_lc: { $regex: `^${t}` } },
        { department_lc: { $regex: `^${t}` } },
        { computerName: { $regex: `^${t}`, $options: "i" } },
        { username: { $regex: `^${t}`, $options: "i" } },
        { department: { $regex: `^${t}`, $options: "i" } },
      ],
    };
  };

  return { $and: terms.map(orForTerm) };
};

const getSearchQueryLegacy = (search = "") => ({
  $or: [
    { ip: { $regex: search, $options: "i" } },
    { computerName: { $regex: search, $options: "i" } },
    { username: { $regex: search, $options: "i" } },
    { fullName: { $regex: search, $options: "i" } },
    { rdp: { $regex: search, $options: "i" } },
    { dnsLog: { $regex: search, $options: "i" } },
    { anyDesk: { $regex: search, $options: "i" } },
    { system: { $regex: search, $options: "i" } },
    { department: { $regex: search, $options: "i" } },
  ],
});

const UpsertIpSchema = z.object({
  ip: z.string().refine(isValidIPv4, "Neispravan IPv4"),
  computerName: z.string().optional(),
  username: z.string().optional(),
  fullName: z.string().optional(),
  password: z.string().optional(),
  rdp: z.string().optional(),
  dnsLog: z.string().optional(),
  anyDesk: z.string().optional(),
  system: z.string().optional(),
  department: z.string().optional(),
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
      "dnsLog",
      "anyDesk",
      "system",
      "department",
    ])
    .optional()
    .default("ip"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  status: z.enum(["all", "online", "offline"]).optional().default("all"),
});

const RangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(1000).optional().default(256),
});

function parseRangeFromEnv() {
  const str = process.env.AVAILABLE_RANGE || "";
  const [start, end] = str.split("-").map((s) => s?.trim());
  if (isValidIPv4(start) && isValidIPv4(end)) return { start, end };
  return {
    start: process.env.AVAILABLE_RANGE_START,
    end: process.env.AVAILABLE_RANGE_END,
  };
}

function labelPrinter(p) {
  const parts = [];
  if (p.name) parts.push(p.name);
  const mm = [p.manufacturer, p.model].filter(Boolean).join(" ");
  if (mm) parts.push(mm);
  if (p.serial) parts.push(`#${p.serial}`);
  if (p.ip) parts.push(`@ ${p.ip}`);
  return parts.join(" · ");
}

async function buildPrintersMap(entries) {
  const ipNums = entries.map((e) => e.ipNumeric).filter(Boolean);
  const ids = entries.map((e) => e._id);

  const printers = await Printer.find({
    $or: [
      { ipNumeric: { $in: ipNums } },
      { hostComputer: { $in: ids } },
      { connectedComputers: { $in: ids } },
    ],
  })
    .select(
      "name manufacturer model serial ip hostComputer connectedComputers ipNumeric"
    )
    .lean();

  const byIpNum = new Map();
  const byHost = new Map();
  const byConnected = new Map();

  for (const p of printers) {
    if (p.ipNumeric != null) {
      if (!byIpNum.has(p.ipNumeric)) byIpNum.set(p.ipNumeric, []);
      byIpNum.get(p.ipNumeric).push(p);
    }
    if (p.hostComputer) {
      const k = String(p.hostComputer);
      if (!byHost.has(k)) byHost.set(k, []);
      byHost.get(k).push(p);
    }
    if (Array.isArray(p.connectedComputers)) {
      for (const cid of p.connectedComputers) {
        const k = String(cid);
        if (!byConnected.has(k)) byConnected.set(k, []);
        byConnected.get(k).push(p);
      }
    }
  }

  const out = new Map();
  for (const e of entries) {
    const kId = String(e._id);
    const set = new Map();
    const fromIp = byIpNum.get(e.ipNumeric) || [];
    const fromHost = byHost.get(kId) || [];
    const fromConn = byConnected.get(kId) || [];
    for (const p of [...fromIp, ...fromHost, ...fromConn])
      set.set(String(p._id), p);
    const label = Array.from(set.values()).map(labelPrinter).join("\n");
    out.set(kId, label);
  }
  return out;
}

router.get(
  "/export-xlsx",
  ah(async (req, res) => {
    const search = String(req.query.search || "");

    const entries = await IpEntry.find(getSearchQueryLegacy(search))
      .select(
        "ip computerName ipNumeric username fullName rdp dnsLog anyDesk system department metadata"
      )
      .sort({ ipNumeric: 1 })
      .lean();

    const printersMap = await buildPrintersMap(entries);

    const rows = entries.map((e) => ({
      ip: e.ip,
      computerName: e.computerName || "",
      ipNumeric: e.ipNumeric ?? "",
      username: e.username || "",
      fullName: e.fullName || "",
      rdp: e.rdp || "",
      dnsLog: e.dnsLog || "",
      anyDesk: e.anyDesk || "",
      system: e.system || "",
      department: e.department || "",
      hasMetadata: e.metadata ? "DA" : "NE",
      printers: printersMap.get(String(e._id)) || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        "ip",
        "computerName",
        "ipNumeric",
        "username",
        "fullName",
        "rdp",
        "dnsLog",
        "anyDesk",
        "system",
        "department",
        "hasMetadata",
        "printers",
      ],
      skipHeader: false,
    });

    ws["!cols"] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 45 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IP-Entries");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ip-entries.xlsx"'
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  })
);

router.get(
  "/export-csv",
  ah(async (req, res) => {
    const search = String(req.query.search || "");

    const entries = await IpEntry.find(getSearchQueryLegacy(search))
      .select(
        "ip computerName ipNumeric username fullName rdp dnsLog anyDesk system department metadata"
      )
      .sort({ ipNumeric: 1 })
      .lean();

    const printersMap = await buildPrintersMap(entries);

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ip-entries.csv"'
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.write(
      "ip,computerName,ipNumeric,username,fullName,rdp,dnsLog,anyDesk,system,department,hasMetadata,printers\n"
    );

    for (const e of entries) {
      const row = [
        e.ip,
        e.computerName || "",
        e.ipNumeric ?? "",
        e.username || "",
        e.fullName || "",
        e.rdp || "",
        e.dnsLog || "",
        e.anyDesk || "",
        e.system || "",
        e.department || "",
        e.metadata ? "DA" : "NE",
        printersMap.get(String(e._id)) || "",
      ]
        .map((v) => String(v).replace(/"/g, '""'))
        .map((v) => `"${v}"`)
        .join(",");
      res.write(row + "\n");
    }
    res.end();
  })
);

router.get(
  "/available",
  ah(async (req, res) => {
    const q = RangeSchema.safeParse({
      start: req.query.start,
      end: req.query.end,
      page: req.query.page,
      limit: req.query.limit,
    });

    const base = q.success ? q.data : {};
    const envRange = parseRangeFromEnv();
    const start = isValidIPv4(base.start) ? base.start : envRange.start;
    const end = isValidIPv4(base.end) ? base.end : envRange.end;
    const page = base.page || 1;
    const limit = base.limit || 256;

    const startNum = ipToNumeric(start);
    const endNum = ipToNumeric(end);
    if (startNum > endNum)
      return res.status(400).json({ message: "Nevažeći opseg" });

    const occupiedEntries = await IpEntry.find({}, "ipNumeric").lean();
    const occupiedSet = new Set(occupiedEntries.map((e) => e.ipNumeric));

    const skipVacant = (page - 1) * limit;
    const result = [];
    let vacantSeen = 0;
    let totalAvailable = 0;

    for (let i = startNum; i <= endNum; i++) {
      if (!occupiedSet.has(i)) {
        totalAvailable++;
        if (vacantSeen >= skipVacant && result.length < limit) {
          result.push(numericToIp(i));
        }
        vacantSeen++;
        if (result.length >= limit) continue;
      }
    }

    res.json({
      range: { start, end },
      page,
      limit,
      totalAvailable,
      totalPages: Math.max(1, Math.ceil(totalAvailable / limit)),
      available: result,
    });
  })
);

router.get(
  "/",
  ah(async (req, res) => {
    const parsed = ListSchema.parse(req.query);
    const { search, page, limit, sortBy, sortOrder, status } = parsed;

    const baseQuery = buildFastSearch(search || "");
    const statusCond =
      status === "online"
        ? { isOnline: true }
        : status === "offline"
        ? { isOnline: false }
        : {};

    const listQuery = { ...baseQuery, ...statusCond };

    let safeSortBy = sortBy === "ip" ? "ipNumeric" : sortBy;
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const skip = (page - 1) * limit;

    const [entries, total, onlineCount, offlineCount] = await Promise.all([
      IpEntry.find(listQuery)
        .select(
          "ip ipNumeric computerName username password fullName rdp dnsLog anyDesk system department metadata isOnline lastChecked lastStatusChange"
        )
        .sort({ [safeSortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      IpEntry.countDocuments(listQuery),
      IpEntry.countDocuments({ ...baseQuery, isOnline: true }),
      IpEntry.countDocuments({ ...baseQuery, isOnline: false }),
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    res.json({
      entries,
      total,
      totalPages,
      page,
      limit,
      counts: { online: onlineCount, offline: offlineCount },
    });
  })
);

router.get(
  "/:id",
  ah(async (req, res) => {
    const entry = await IpEntry.findById(req.params.id).lean();
    if (!entry) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json(entry);
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const parsed = UpsertIpSchema.parse(req.body);
    const newEntry = await IpEntry.create(parsed);
    res.status(201).json(newEntry);
  })
);

router.put(
  "/:id",
  ah(async (req, res) => {
    const parsed = UpsertIpSchema.partial().parse(req.body);
    const updated = await IpEntry.findByIdAndUpdate(req.params.id, parsed, {
      new: true,
    }).lean();
    if (!updated)
      return res.status(404).json({ message: "Unos nije pronađen" });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    const result = await IpEntry.findByIdAndDelete(req.params.id).lean();
    if (!result) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json({ message: "Unos obrisan" });
  })
);

router.post(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip))
      return res.status(400).json({ message: "Neispravan IP" });
    const out = await setMetadataForIp(ip, req.body);
    res.json(out);
  })
);

router.get(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip))
      return res.status(400).json({ message: "Neispravan IP" });
    const row = await IpEntry.findOne({ ip }).populate("metadata").lean();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  })
);

router.patch(
  "/:ip/metadata",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip))
      return res.status(400).json({ message: "Neispravan IP" });

    const ipEntry = await IpEntry.findOne({ ip }).lean();
    if (!ipEntry) return res.status(404).json({ error: "IpEntry not found" });

    const meta = await ComputerMetadata.findOneAndUpdate(
      { ipEntry: ipEntry._id },
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();

    if (!meta) return res.status(404).json({ error: "Metadata not found" });
    res.json(meta);
  })
);

router.get(
  "/:id/printers",
  ah(async (req, res) => {
    const entry = await IpEntry.findById(req.params.id)
      .populate({
        path: "printersHosted",
        select: "name manufacturer model serial ip shared",
      })
      .populate({
        path: "printersConnected",
        select: "name manufacturer model serial ip shared",
      })
      .lean();

    if (!entry) return res.status(404).json({ message: "Unos nije pronađen" });

    res.json({
      hosted: entry.printersHosted || [],
      connected: entry.printersConnected || [],
    });
  })
);

router.get(
  "/by-ip/:ip/printers",
  ah(async (req, res) => {
    const ip = req.params.ip;
    if (!isValidIPv4(ip))
      return res.status(400).json({ message: "Neispravan IP" });

    const entry = await IpEntry.findOne({ ip })
      .populate("printersHosted", "name manufacturer model serial ip shared")
      .populate("printersConnected", "name manufacturer model serial ip shared")
      .lean();

    if (!entry) return res.status(404).json({ message: "Unos nije pronađen" });

    res.json({
      hosted: entry.printersHosted || [],
      connected: entry.printersConnected || [],
    });
  })
);

export default router;
