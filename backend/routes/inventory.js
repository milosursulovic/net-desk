import express from "express";
import InventoryItem from "../models/InventoryItem.js";
import ExcelJS from "exceljs";

const router = express.Router();

router.get("/export", async (req, res) => {
  try {
    const items = await InventoryItem.find().lean();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventar");

    sheet.columns = [
      { header: "Tip", key: "type", width: 18 },
      { header: "Proizvođač", key: "manufacturer", width: 20 },
      { header: "Model", key: "model", width: 28 },
      { header: "Serijski broj", key: "serialNumber", width: 25 },
      { header: "Količina", key: "quantity", width: 10 },
      { header: "Kapacitet", key: "capacity", width: 12 },
      { header: "Brzina", key: "speed", width: 15 },
      { header: "Socket/Konektor", key: "socket", width: 18 },
      { header: "Lokacija", key: "location", width: 24 },
      { header: "Napomena", key: "notes", width: 40 },
      { header: "Kreirano", key: "createdAt", width: 20 },
      { header: "Ažurirano", key: "updatedAt", width: 20 },
    ];

    items.forEach((it) => {
      sheet.addRow({
        ...it,
        createdAt: it.createdAt ? new Date(it.createdAt).toLocaleString() : "",
        updatedAt: it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=inventar.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Greška pri eksportu" });
  }
});

router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 100);

    const { search = "", type = "all" } = req.query;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const query = {};

    if (type && type !== "all") {
      query.type = type;
    }

    if (search && search.trim() !== "") {
      const term = search.trim();
      const regex = new RegExp(term, "i");
      query.$or = [
        { manufacturer: regex },
        { model: regex },
        { serialNumber: regex },
        { location: regex },
        { notes: regex },
        { capacity: regex },
        { speed: regex },
        { socket: regex },
      ];
    }

    const sortFields = {
      type: "type",
      manufacturer: "manufacturer",
      model: "model",
      location: "location",
      createdAt: "createdAt",
    };
    const sortKey = sortFields[sortBy] || "createdAt";
    const sort = { [sortKey]: sortOrder };

    const [entries, total, countsAgg] = await Promise.all([
      InventoryItem.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      InventoryItem.countDocuments(query),
      InventoryItem.aggregate([
        {
          $group: {
            _id: "$status",
            totalQty: { $sum: { $ifNull: ["$quantity", 1] } },
          },
        },
      ]),
    ]);

    const counts = {
      available: 0,
      inUse: 0,
      reserved: 0,
      faulty: 0,
    };

    for (const c of countsAgg) {
      if (c._id === "available") counts.available = c.totalQty;
      if (c._id === "in-use") counts.inUse = c.totalQty;
      if (c._id === "reserved") counts.reserved = c.totalQty;
      if (c._id === "faulty") counts.faulty = c.totalQty;
    }

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    res.json({
      entries,
      total,
      totalPages,
      counts,
    });
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: "Greška pri dohvatanju inventara." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Stavka nije pronađena." });
    res.json(item);
  } catch (err) {
    console.error("Error fetching inventory item:", err);
    res.status(500).json({ error: "Greška pri dohvatanju stavke." });
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};

    if (!payload.type || !payload.model) {
      return res.status(400).json({ error: "Tip opreme i model su obavezni." });
    }

    const item = await InventoryItem.create({
      type: payload.type,
      manufacturer: payload.manufacturer,
      model: payload.model,
      serialNumber: payload.serialNumber,
      quantity: payload.quantity ?? 1,
      capacity: payload.capacity,
      speed: payload.speed,
      socket: payload.socket,
      location: payload.location,
      notes: payload.notes,
    });

    res.status(201).json(item);
  } catch (err) {
    console.error("Error creating inventory item:", err);
    res.status(500).json({ error: "Greška pri kreiranju stavke." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const payload = req.body || {};

    const update = {
      type: payload.type,
      manufacturer: payload.manufacturer,
      model: payload.model,
      serialNumber: payload.serialNumber,
      quantity: payload.quantity ?? 1,
      capacity: payload.capacity,
      speed: payload.speed,
      socket: payload.socket,
      location: payload.location,
      notes: payload.notes,
    };

    const item = await InventoryItem.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!item) return res.status(404).json({ error: "Stavka nije pronađena." });

    res.json(item);
  } catch (err) {
    console.error("Error updating inventory item:", err);
    res.status(500).json({ error: "Greška pri izmeni stavke." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndDelete(req.params.id).lean();
    if (!item) return res.status(404).json({ error: "Stavka nije pronađena." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting inventory item:", err);
    res.status(500).json({ error: "Greška pri brisanju stavke." });
  }
});

export default router;
