import express from "express";
import multer from "multer";
import fs from "fs";
import XLSX from "xlsx";
import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";
import { setMetadataForIp } from "../services/ipEntryService.js";
import { isValidIPv4, ipToNumeric, numericToIp } from "../utils/ip.js";
import { ah } from "../utils/asyncHandler.js";
import { z } from "zod";

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---- Brži search: prefiksi + *_lc polja (uz fallback na originalna) ----
const buildFastSearch = (raw = "") => {
  const q = String(raw || "").trim();
  if (!q) return {};
  const qLc = q.toLowerCase();
  const terms = qLc.split(/\s+/).slice(0, 3);

  const orForTerm = (t) => {
    const ipPrefix = t.replace(/\./g, "\\."); // npr. "10.230." → prefiks
    return {
      $or: [
        { ip: { $regex: `^${ipPrefix}` } },
        { computerName_lc: { $regex: `^${t}` } },
        { username_lc: { $regex: `^${t}` } },
        { department_lc: { $regex: `^${t}` } },
        // fallback ako _lc polja još nisu popunjena za stare redove:
        { computerName: { $regex: `^${t}`, $options: "i" } },
        { username: { $regex: `^${t}`, $options: "i" } },
        { department: { $regex: `^${t}`, $options: "i" } },
      ],
    };
  };

  return { $and: terms.map(orForTerm) };
};

// Za staru kompatibilnost (npr. u export-xlsx gde je ok širi match)
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

// Schemas
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
});

const RangeSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(1000).optional().default(256),
});

// Helpers
function parseRangeFromEnv() {
  const str = process.env.AVAILABLE_RANGE || "";
  const [start, end] = str.split("-").map((s) => s?.trim());
  if (isValidIPv4(start) && isValidIPv4(end)) return { start, end };
  return { start: "10.230.62.1", end: "10.230.63.254" };
}

// ---- Export XLSX (bez password polja) ----
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

    // Napomena: oslanjamo se na ref polje `metadata` (često je dovoljno)
    const data = entries.map((e) => ({
      ip: e.ip,
      computerName: e.computerName,
      ipNumeric: e.ipNumeric,
      username: e.username,
      fullName: e.fullName,
      rdp: e.rdp,
      dnsLog: e.dnsLog,
      anyDesk: e.anyDesk,
      system: e.system,
      department: e.department,
      hasMetadata: e.metadata ? "DA" : "NE",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "IP-Entries");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
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

// ---- Export CSV (streaming) ----
router.get(
  "/export-csv",
  ah(async (req, res) => {
    const search = String(req.query.search || "");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="ip-entries.csv"'
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    // Header
    res.write(
      "ip,computerName,ipNumeric,username,fullName,rdp,dnsLog,anyDesk,system,department,hasMetadata\n"
    );

    const cursor = IpEntry.find(getSearchQueryLegacy(search))
      .select(
        "ip computerName ipNumeric username fullName rdp dnsLog anyDesk system department metadata"
      )
      .sort({ ipNumeric: 1 })
      .lean()
      .cursor();

    for await (const e of cursor) {
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
      ]
        .map((v) => String(v).replace(/"/g, '""')) // escape quotes
        .map((v) => `"${v}"`)
        .join(",");
      res.write(row + "\n");
    }
    res.end();
  })
);

// ---- Import (upsert, batch) ----
router.post(
  "/import",
  upload.single("file"),
  ah(async (req, res) => {
    const filePath = req.file?.path;
    const ext = req.file?.originalname?.split(".").pop().toLowerCase();

    if (!filePath || !ext)
      return res.status(400).json({ message: "Nevažeći fajl" });
    if (ext !== "xlsx")
      return res.status(400).json({ message: "Nepodržan format fajla" });

    try {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      const docs = rows
        .map((row) => {
          const ip = row.ip?.toString().trim();
          if (!ip || !isValidIPv4(ip)) return null;
          return {
            ip,
            computerName: row.computerName?.toString().trim() || "",
            ipNumeric: row.ipNumeric || ipToNumeric(ip),
            username: row.username?.toString().trim() || "",
            fullName: row.fullName?.toString().trim() || "",
            password: row.password?.toString().trim() || "",
            rdp: row.rdp?.toString().trim() || "",
            dnsLog: row.dnsLog?.toString().trim() || "",
            anyDesk: row.anyDesk?.toString().trim() || "",
            system: row.system?.toString().trim() || "",
            department: row.department?.toString().trim() || "",
          };
        })
        .filter(Boolean);

      let upserted = 0,
        modified = 0,
        matched = 0;

      const BATCH = 2000;
      for (let i = 0; i < docs.length; i += BATCH) {
        const chunk = docs.slice(i, i + BATCH);
        const bulk = chunk.map((doc) => ({
          updateOne: {
            filter: { ip: doc.ip },
            update: { $set: doc },
            upsert: true,
          },
        }));
        const r = await IpEntry.bulkWrite(bulk, { ordered: false });
        upserted += r.upsertedCount || 0;
        modified += r.modifiedCount || 0;
        matched += r.matchedCount || 0;
      }

      res.json({ message: "Import uspešan", upserted, modified, matched });
    } finally {
      if (filePath) fs.unlink(filePath, () => {});
    }
  })
);

// ---- Available IPs (paginacija) ----
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

    // Paginacija: preskoči (page-1)*limit praznih, skupi `limit` praznih
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

// ---- List (brži select + lean + fastSearch) ----
router.get(
  "/",
  ah(async (req, res) => {
    const parsed = ListSchema.parse(req.query);
    const { search, page, limit, sortBy, sortOrder } = parsed;

    const query = buildFastSearch(search || "");
    let safeSortBy = sortBy === "ip" ? "ipNumeric" : sortBy;
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const skip = (page - 1) * limit;

    const [entries, total] = await Promise.all([
      IpEntry.find(query)
        .select(
          "ip ipNumeric computerName username password fullName rdp dnsLog anyDesk system department metadata isOnline lastChecked lastStatusChange"
        )
        .sort({ [safeSortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .lean(),
      IpEntry.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);
    res.json({ entries, total, totalPages, page, limit });
  })
);

// ---- CRUD ----
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

// ---- Metadata linkovi ----
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

// ---- Printers for entry ----
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
