import express from "express";
import IpEntry from "../models/IpEntry.js";
import { Parser } from "json2csv";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "ip",
      sortOrder = "asc",
    } = req.query;

    const query = {
      $or: [
        { ip: { $regex: search, $options: "i" } },
        { computerName: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { rdp: { $regex: search, $options: "i" } },
      ],
    };

    const allowedSortFields = [
      "ip",
      "computerName",
      "username",
      "fullName",
      "rdp",
    ];
    let safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : "ip";

    if (safeSortBy === "ip") {
      safeSortBy = "ipNumeric";
    }
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

router.post("/", async (req, res) => {
  const { ip, computerName, username, fullName, password, rdp } = req.body;

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

router.get("/export", async (req, res) => {
  try {
    const { search = "" } = req.query;

    const query = {
      $or: [
        { ip: { $regex: search, $options: "i" } },
        { computerName: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { rdp: { $regex: search, $options: "i" } },
      ],
    };

    const entries = await IpEntry.find(query).sort({ ipNumeric: 1 });

    const fields = [
      "ip",
      "computerName",
      "username",
      "fullName",
      "password",
      "rdp",
    ];
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(entries);

    res.setHeader("Content-Disposition", "attachment; filename=ip-entries.csv");
    res.setHeader("Content-Type", "text/csv");
    res.status(200).send(csv);
  } catch (err) {
    console.error("CSV Export error:", err);
    res.status(500).json({ message: "Greška pri izvozu CSV-a" });
  }
});

router.post("/import", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;

  const results = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (data) => {
      results.push(data);
    })
    .on("end", async () => {
      try {
        // Validate & clean
        const entriesToInsert = results
          .map((row) => ({
            ip: row.ip?.trim(),
            computerName: row.computerName?.trim() || "",
            username: row.username?.trim() || "",
            fullName: row.fullName?.trim() || "",
            password: row.password?.trim() || "",
            rdp: row.rdp?.trim() || "",
          }))
          .filter((e) => e.ip); // Remove empty IPs

        const inserted = await IpEntry.insertMany(entriesToInsert, {
          ordered: false,
        });

        fs.unlinkSync(filePath); // cleanup
        res
          .status(200)
          .json({ message: "Import uspešan", count: inserted.length });
      } catch (err) {
        console.error("CSV import error:", err);
        fs.unlinkSync(filePath);
        res.status(500).json({ message: "Greška pri importu CSV-a" });
      }
    });
});

router.get("/available", async (req, res) => {
  try {
    const occupiedEntries = await IpEntry.find({}, "ipNumeric");

    const occupiedSet = new Set(occupiedEntries.map((e) => e.ipNumeric));

    const ipToNumeric = (ip) =>
      ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);

    const numericToIp = (num) =>
      [24, 16, 8, 0].map((shift) => (num >> shift) & 255).join(".");

    const start = ipToNumeric("10.230.62.1");
    const end = ipToNumeric("10.230.63.254");

    const availableIps = [];
    for (let i = start; i <= end; i++) {
      if (!occupiedSet.has(i)) {
        availableIps.push(numericToIp(i));
      }
    }

    res.json({ available: availableIps });
  } catch (err) {
    console.error("Greška pri dohvatanju slobodnih IP adresa:", err);
    res.status(500).json({ message: "Greška na serveru" });
  }
});

export default router;
