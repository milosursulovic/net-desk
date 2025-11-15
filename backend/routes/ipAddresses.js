import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";
import { setMetadataForIp } from "../services/ipEntryService.js";
import { isValidIPv4, ipToNumeric, numericToIp } from "../utils/ip.js";
import { ah } from "../utils/asyncHandler.js";
import { z } from "zod";
import net from "net";
import tls from "tls";

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
      try {
        socket.destroy();
      } catch {}
      const out = {
        ip,
        port,
        open: !!ok,
        rttMs: Date.now() - start,
        protocol: proto,
        serviceHint: null,
        banner: banner ? String(banner).slice(0, 800) : null,
        ...extra,
      };
      console.log(
        `[port-scan] result ${ip}:${port} open=${out.open} rtt=${out.rttMs} hint=${out.serviceHint}`
      );
      resolve(out);
    };

    socket.setTimeout(timeoutMs);

    socket.once("error", (err) => {
      console.log(
        `[port-scan] error ${ip}:${port} ->`,
        err?.code || err?.message || err
      );
      finish(false, { error: err?.code || String(err) });
    });

    socket.once("timeout", () => {
      console.log(`[port-scan] timeout ${ip}:${port}`);
      finish(false, { timeout: true });
    });

    socket.once("connect", () => {
      console.log(`[port-scan] connected ${ip}:${port}`);
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
              banner = `TLS:${tlsSock.getProtocol() || "?"} · CN=${
                cert.subject?.CN || "?"
              }`;
              finish(true);
            });
            tlsSock.once("error", (e) => {
              console.log(
                `[port-scan] tls error ${ip}:${port} ->`,
                e?.message || e
              );
              finish(true);
            });
            tlsSock.once("timeout", () => finish(true));
            return;
          } catch (e) {
            console.log(`[port-scan] tls wrap exception ${ip}:${port}`, e);
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
      } catch (e) {
        console.log(`[port-scan] connect-handler-ex ${ip}:${port}`, e);
        finish(true);
      }
    });

    try {
      socket.connect(port, ip);
    } catch (e) {
      console.log(`[port-scan] connect-ex ${ip}:${port}`, e);
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
  for (const seg of String(str)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (seg.includes("-")) {
      const parts = seg.split("-").map((x) => parseInt(x.trim(), 10));
      if (
        parts.length === 2 &&
        Number.isInteger(parts[0]) &&
        Number.isInteger(parts[1])
      ) {
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
  return arr.length
    ? arr
    : (function () {
        const full = [];
        for (let p = 1; p <= 65535; p++) full.push(p);
        return full;
      })();
}

const ScanSchema = z.object({
  ip: z.string().refine(isValidIPv4, { message: "Neispravan IPv4" }),
  ports: z.string().optional(),
  timeoutMs: z.coerce
    .number()
    .int()
    .min(100)
    .max(20000)
    .optional()
    .default(100),
  concurrency: z.coerce.number().int().min(1).max(1024).optional().default(64),
});

const router = express.Router();

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
            .catch((err) => {
              console.log("[port-scan] probe error", err);
              results.push({ ip, port, open: false, error: String(err) });
            })
            .finally(() => {
              running--;
              kick();
            });
        }
      };
      kick();
    });

    const open = results.filter((r) => r.open).sort((a, b) => a.port - b.port);
    res.json({
      ip,
      scanned: results.length,
      openCount: open.length,
      open,
      raw: results,
    });
  })
);

router.get(
  "/duplicates",
  ah(async (req, res) => {
    const parsed = ListSchema.parse(req.query);
    const { search, status } = parsed;

    const baseQuery = buildFastSearch(search || "");
    const statusCond =
      status === "online"
        ? { isOnline: true }
        : status === "offline"
        ? { isOnline: false }
        : {};

    const match = { ...baseQuery, ...statusCond };

    const pipeline = [
      { $match: match },

      {
        $addFields: {
          _compKey: {
            $toLower: {
              $trim: { input: { $ifNull: ["$computerName", ""] } },
            },
          },
        },
      },

      { $match: { _compKey: { $type: "string", $ne: "" } } },

      {
        $group: {
          _id: "$_compKey",
          name: { $first: "$computerName" },
          count: { $sum: 1 },
          items: {
            $push: {
              _id: "$_id",
              ip: "$ip",
              computerName: "$computerName",
              username: "$username",
              department: "$department",
              updatedAt: "$updatedAt",
            },
          },
        },
      },

      { $match: { count: { $gt: 1 } } },

      { $sort: { count: -1, name: 1 } },

      {
        $project: {
          _id: 0,
          key: "$_compKey",
          name: 1,
          count: 1,
          items: 1,
        },
      },
    ];

    const dupes = await IpEntry.aggregate(pipeline);
    res.json({
      totalDuplicateGroups: dupes.length,
      totalDuplicateRows: dupes.reduce((acc, g) => acc + g.count, 0),
      groups: dupes,
    });
  })
);

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

    const rows = entries.map((e) => ({
      ip: e.ip,
      computerName: e.computerName || "",
      username: e.username || "",
      fullName: e.fullName || "",
      rdp: e.rdp || "",
      dnsLog: e.dnsLog || "",
      anyDesk: e.anyDesk || "",
      system: e.system || "",
      department: e.department || "",
      hasMetadata: e.metadata ? "DA" : "NE",
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: [
        "ip",
        "computerName",
        "username",
        "fullName",
        "rdp",
        "dnsLog",
        "anyDesk",
        "system",
        "department",
        "hasMetadata",
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

export default router;
