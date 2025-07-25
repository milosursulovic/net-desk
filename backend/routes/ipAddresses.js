import express from "express";
import multer from "multer";
import fs from "fs";
import XLSX from "xlsx";
import IpEntry from "../models/IpEntry.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const getSearchQuery = (search = "") => ({
  $or: [
    { ip: { $regex: search, $options: "i" } },
    { computerName: { $regex: search, $options: "i" } },
    { username: { $regex: search, $options: "i" } },
    { fullName: { $regex: search, $options: "i" } },
    { rdp: { $regex: search, $options: "i" } },
    { dnsLog: { $regex: search, $options: "i" } },
    { anyDesk: { $regex: search, $options: "i" } },
    { system: { $regex: search, $options: "i" } },
  ],
});

const ipToNumeric = (ip) =>
  ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);

const numericToIp = (num) =>
  [24, 16, 8, 0].map((shift) => (num >> shift) & 255).join(".");

const getFilteredEntries = async (search) => {
  const query = getSearchQuery(search);
  return await IpEntry.find(query).sort({ ipNumeric: 1 });
};

router.get("/export-xlsx", async (req, res) => {
  try {
    const entries = await getFilteredEntries(req.query.search);
    const data = entries.map((e) => ({
      ip: e.ip,
      computerName: e.computerName,
      ipNumeric: e.ipNumeric,
      username: e.username,
      fullName: e.fullName,
      password: e.password,
      rdp: e.rdp,
      dnsLog: e.dnsLog,
      anyDesk: e.anyDesk,
      system: e.system,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "IP-Entries");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ip-entries.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (err) {
    console.error("Greška pri izvozu XLSX:", err);
    res.status(500).json({ message: "Greška pri izvozu XLSX" });
  }
});

router.post("/import", upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;
  const ext = req.file?.originalname?.split(".").pop().toLowerCase();

  if (!filePath || !ext)
    return res.status(400).json({ message: "Nevažeći fajl" });

  try {
    let results = [];

    if (ext === "xlsx") {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      results = XLSX.utils.sheet_to_json(sheet);
    } else {
      return res.status(400).json({ message: "Nepodržan format fajla" });
    }

    const entriesToInsert = results
      .map((row) => {
        const ip = row.ip?.trim();
        if (!ip) return null;
        return {
          ip,
          computerName: row.computerName?.trim() || "",
          ipNumeric: row.ipNumeric || ipToNumeric(ip),
          username: row.username?.trim() || "",
          fullName: row.fullName?.trim() || "",
          password: row.password?.trim() || "",
          rdp: row.rdp?.trim() || "",
          dnsLog: row.dnsLog?.trim() || "",
          anyDesk: row.anyDesk?.trim() || "",
          system: row.system?.trim() || "",
        };
      })
      .filter(Boolean);

    const inserted = await IpEntry.insertMany(entriesToInsert, {
      ordered: false,
    });
    res.json({ message: "Import uspešan", count: inserted.length });
  } catch (err) {
    console.error("Greška pri importu:", err);
    res.status(500).json({ message: "Greška pri importu" });
  } finally {
    fs.unlink(filePath, () => {});
  }
});

router.get("/available", async (req, res) => {
  try {
    const occupiedEntries = await IpEntry.find({}, "ipNumeric");
    const occupiedSet = new Set(occupiedEntries.map((e) => e.ipNumeric));

    const start = ipToNumeric("10.230.62.1");
    const end = ipToNumeric("10.230.63.254");

    const availableIps = [];
    for (let i = start; i <= end; i++) {
      if (!occupiedSet.has(i)) availableIps.push(numericToIp(i));
    }

    res.json({ available: availableIps });
  } catch (err) {
    console.error("Greška pri dohvatanju slobodnih IP adresa:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "ip",
      sortOrder = "asc",
    } = req.query;

    const query = getSearchQuery(search);
    const allowedSortFields = [
      "ip",
      "computerName",
      "username",
      "fullName",
      "rdp",
      "dnsLog",
      "anyDesk",
      "system",
    ];

    let safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "ip";
    if (safeSortBy === "ip") safeSortBy = "ipNumeric";

    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const entries = await IpEntry.find(query)
      .sort({ [safeSortBy]: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await IpEntry.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({ entries, total, totalPages });
  } catch (err) {
    console.error("Error fetching IP addresses:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const entry = await IpEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json(entry);
  } catch (err) {
    console.error("Greška pri dohvatu unosa:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

router.post("/", async (req, res) => {
  const {
    ip,
    computerName,
    username,
    fullName,
    password,
    rdp,
    dnsLog = "",
  } = req.body;
  if (!ip)
    return res.status(400).json({ message: "IP adresa je obavezno polje" });

  try {
    const newEntry = new IpEntry({
      ip,
      computerName,
      username,
      fullName,
      password,
      rdp,
      dnsLog,
    });
    await newEntry.save();
    res.status(201).json(newEntry);
  } catch (err) {
    console.error("Error adding IP entry:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await IpEntry.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!updated)
      return res.status(404).json({ message: "Unos nije pronađen" });
    res.json(updated);
  } catch (err) {
    console.error("Error updating IP entry:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const result = await IpEntry.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: "Unos nije pronađen" });
    res.json({ message: "Unos obrisan" });
  } catch (err) {
    console.error("Error deleting IP entry:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

export default router;
