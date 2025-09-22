import express from "express";
import ExcelJS from "exceljs";

import Domain from "../models/Domain.js";
import IpEntry from "../models/IpEntry.js";
import { authenticateToken } from "../middlewares/auth.js";
import loadBlockedKeywords from "../utils/loadBlockedKeywords.js";
import escapeRegex from "../utils/escapeRegex.js";
import getClientIp from "../utils/getClientIp.js";
import { isValidIPv4 } from "../utils/ip.js";

const router = express.Router();
const blockedKeywords = loadBlockedKeywords();

function parseListQuery(req) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
  const sortBy = req.query.sortBy || "timestamp";
  const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
  const rawSearch = (req.query.search || "").trim();

  const sort = { [sortBy]: sortOrder };
  const nameRegex = rawSearch ? new RegExp(escapeRegex(rawSearch), "i") : null;

  return { page, limit, sort, rawSearch, nameRegex };
}

const LIST_PROJECTION = { name: 1, timestamp: 1, category: 1, ipEntry: 1 };
const POPULATE_IPENTRY = {
  path: "ipEntry",
  select: "ip ipNumeric computerName department",
};

async function buildDomainQueryFromSearch({ nameRegex, rawSearch }) {
  const query = {};

  const ipEntryIds = [];
  if (rawSearch) {
    const ipRegex = new RegExp(escapeRegex(rawSearch), "i");

    const ipMatches = await IpEntry.find(
      isValidIPv4(rawSearch) ? { ip: rawSearch } : { ip: { $regex: ipRegex } },
      { _id: 1 }
    ).lean();

    if (ipMatches.length) {
      ipEntryIds.push(...ipMatches.map((d) => d._id));
    }

    if (nameRegex || ipEntryIds.length) {
      query.$or = [];
      if (nameRegex) query.$or.push({ name: { $regex: nameRegex } });
      if (ipEntryIds.length) query.$or.push({ ipEntry: { $in: ipEntryIds } });
      if (!query.$or.length) delete query.$or;
    }
  }

  return query;
}

function mapWithIpVirtual(rows) {
  return rows.map((r) => ({
    ...r,
    ip: r.ipEntry?.ip || "",
  }));
}

router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page, limit, sort, rawSearch, nameRegex } = parseListQuery(req);
    const query = await buildDomainQueryFromSearch({ nameRegex, rawSearch });

    const [rows, total] = await Promise.all([
      Domain.find(query, LIST_PROJECTION)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(POPULATE_IPENTRY)
        .lean(),
      Domain.countDocuments(query),
    ]);

    res.json({
      data: mapWithIpVirtual(rows),
      total,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/blocked", authenticateToken, async (req, res) => {
  try {
    const { page, limit, sort, rawSearch, nameRegex } = parseListQuery(req);
    const baseQuery = await buildDomainQueryFromSearch({
      nameRegex,
      rawSearch,
    });
    const query = { ...baseQuery, category: "blocked" };

    const [rows, total] = await Promise.all([
      Domain.find(query, LIST_PROJECTION)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(POPULATE_IPENTRY)
        .lean(),
      Domain.countDocuments(query),
    ]);

    res.json({
      data: mapWithIpVirtual(rows),
      total,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch blocked domains" });
  }
});

router.post("/", async (req, res) => {
  try {
    const domains = req.body;
    if (!Array.isArray(domains) || domains.length === 0) {
      return res
        .status(400)
        .json({ error: "Expected non-empty array of domains" });
    }

    const clientIp = getClientIp(req);
    if (!isValidIPv4(clientIp)) {
      return res
        .status(400)
        .json({ error: `Neispravna klijentska IP adresa: ${clientIp}` });
    }

    const ipEntry = await IpEntry.findOne({ ip: clientIp }, { _id: 1 }).lean();
    if (!ipEntry?._id) {
      return res.status(400).json({
        error: `IP ${clientIp} nije registrovan u IpEntry. Dodajte je u evidenciju pa pokušajte ponovo.`,
      });
    }

    const uniqueNames = [
      ...new Set(
        domains
          .map((d) => (typeof d === "string" ? d.trim() : ""))
          .filter(Boolean)
      ),
    ];

    const docs = uniqueNames.map((name) => {
      const lower = name.toLowerCase();
      const category = blockedKeywords.some((kw) => lower.includes(kw))
        ? "blocked"
        : "normal";
      return { name, ipEntry: ipEntry._id, category };
    });

    if (!docs.length) {
      return res.status(400).json({ error: "No valid domain names provided" });
    }

    await Domain.insertMany(docs, { ordered: false });

    const blockedCount = docs.reduce(
      (acc, d) => acc + (d.category === "blocked" ? 1 : 0),
      0
    );

    res.status(201).json({
      message: `Inserted ${docs.length} domains for IP ${clientIp}.`,
      blocked: blockedCount,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to insert domains" });
  }
});

router.get("/export", authenticateToken, async (req, res) => {
  try {
    const { rawSearch, nameRegex } = parseListQuery(req);
    const query = await buildDomainQueryFromSearch({ nameRegex, rawSearch });

    const rows = await Domain.find(query, LIST_PROJECTION)
      .sort({ timestamp: -1 })
      .populate(POPULATE_IPENTRY)
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("DNS Logovi");

    worksheet.columns = [
      { header: "#", key: "index", width: 6 },
      { header: "Domain", key: "name", width: 30 },
      { header: "IP Adresa", key: "ip", width: 20 },
      { header: "Vreme", key: "timestamp", width: 25 },
      { header: "Kategorija", key: "category", width: 15 },
    ];

    rows.forEach((entry, i) => {
      worksheet.addRow({
        index: i + 1,
        name: entry.name,
        ip: entry.ipEntry?.ip || "",
        timestamp: new Date(entry.timestamp).toLocaleString("sr-RS"),
        category: entry.category,
      });
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=dns-logovi-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Greška pri eksportovanju:", err);
    res.status(500).json({ error: "Greška pri eksportovanju u Excel" });
  }
});

export default router;
