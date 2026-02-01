import express from "express";
import ExcelJS from "exceljs";
import { pool } from "../index.js";

const router = express.Router();

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

function toInt(v, def = null) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function emptyToNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

const SORT_FIELDS = {
  type: "type",
  manufacturer: "manufacturer",
  model: "model",
  location: "location",
  createdAt: "created_at",
};

const ALLOWED_STATUS = new Set(["available", "in-use", "reserved", "faulty"]);
function normalizeStatus(s) {
  const v = (s ?? "").toString().trim();
  return ALLOWED_STATUS.has(v) ? v : "available";
}

router.get("/export", async (_req, res) => {
  try {
    const [items] = await pool.execute(
      `SELECT
         id, type, manufacturer, model,
         serial_number AS serialNumber,
         quantity, status,
         capacity, speed, socket, location, notes,
         created_at AS createdAt, updated_at AS updatedAt
       FROM inventory_items
       ORDER BY created_at DESC`
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventar");

    sheet.columns = [
      { header: "Tip", key: "type", width: 18 },
      { header: "Proizvođač", key: "manufacturer", width: 20 },
      { header: "Model", key: "model", width: 28 },
      { header: "Serijski broj", key: "serialNumber", width: 25 },
      { header: "Količina", key: "quantity", width: 10 },
      { header: "Status", key: "status", width: 14 },
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
    console.error("Error exporting inventory:", err);
    res.status(500).json({ error: "Greška pri eksportu" });
  }
});

router.get("/", async (req, res) => {
  try {
    const rawPage = clamp(toInt(req.query.page, 1), 1, 1_000_000);
    const limit = clamp(toInt(req.query.limit, 12), 1, 100);

    const search = (req.query.search ?? "").toString().trim();
    const type = (req.query.type ?? "all").toString().trim();

    const sortBy = (req.query.sortBy ?? "createdAt").toString();
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";
    const sortKey = SORT_FIELDS[sortBy] || "created_at";

    const where = [];
    const params = [];

    if (type && type !== "all") {
      where.push("type = ?");
      params.push(type);
    }

    if (search !== "") {
      const like = `%${search}%`;
      where.push(`(
        manufacturer LIKE ? OR
        model LIKE ? OR
        serial_number LIKE ? OR
        location LIKE ? OR
        notes LIKE ? OR
        capacity LIKE ? OR
        speed LIKE ? OR
        socket LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sqlCount = `
      SELECT COUNT(*) AS total
      FROM inventory_items
      ${whereSql}
    `;

    const sqlCounts = `
      SELECT status, SUM(COALESCE(quantity, 1)) AS totalQty
      FROM inventory_items
      ${whereSql}
      GROUP BY status
    `;

     const [[countRows], [countsRows]] = await Promise.all([
      pool.execute(sqlCount, params),
      pool.execute(sqlCounts, params),
    ]);

    const total = Number(countRows?.[0]?.total ?? 0);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const safePage = totalPages === 0 ? 1 : clamp(rawPage, 1, totalPages);
    const offset = (safePage - 1) * limit;

    const sqlEntries = `
      SELECT
        id, type, manufacturer, model,
        serial_number AS serialNumber,
        quantity, status,
        capacity, speed, socket, location, notes,
        created_at AS createdAt, updated_at AS updatedAt
      FROM inventory_items
      ${whereSql}
      ORDER BY ${sortKey} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const [entries] = await pool.execute(sqlEntries, [...params, limit, offset]);

    const counts = { available: 0, inUse: 0, reserved: 0, faulty: 0 };
    for (const c of countsRows || []) {
      const qty = Number(c.totalQty) || 0;
      if (c.status === "available") counts.available = qty;
      if (c.status === "in-use") counts.inUse = qty;
      if (c.status === "reserved") counts.reserved = qty;
      if (c.status === "faulty") counts.faulty = qty;
    }

    res.json({
      entries,
      total,
      totalPages,
      page: safePage,
      limit,
      search,
      type,
      sortBy,
      sortOrder: sortOrder.toLowerCase(),
      counts,
    });
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: "Greška pri dohvatanju inventara." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    const [rows] = await pool.execute(
      `SELECT
         id, type, manufacturer, model,
         serial_number AS serialNumber,
         quantity, status,
         capacity, speed, socket, location, notes,
         created_at AS createdAt, updated_at AS updatedAt
       FROM inventory_items
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    const item = rows?.[0];
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

    const type = emptyToNull(payload.type);
    const model = emptyToNull(payload.model);
    if (!type || !model) {
      return res.status(400).json({ error: "Tip opreme i model su obavezni." });
    }

    const quantityRaw = Number(payload.quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw >= 1 ? quantityRaw : 1;

    const status = normalizeStatus(payload.status);

    const [result] = await pool.execute(
      `INSERT INTO inventory_items
        (type, manufacturer, model, serial_number, quantity, status, capacity, speed, socket, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        emptyToNull(payload.manufacturer),
        model,
        emptyToNull(payload.serialNumber),
        quantity,
        status,
        emptyToNull(payload.capacity),
        emptyToNull(payload.speed),
        emptyToNull(payload.socket),
        emptyToNull(payload.location),
        emptyToNull(payload.notes),
      ]
    );

    const id = result.insertId;

    const [rows] = await pool.execute(
      `SELECT
         id, type, manufacturer, model,
         serial_number AS serialNumber,
         quantity, status,
         capacity, speed, socket, location, notes,
         created_at AS createdAt, updated_at AS updatedAt
       FROM inventory_items
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    res.status(201).json(rows?.[0]);
  } catch (err) {
    console.error("Error creating inventory item:", err);
    res.status(500).json({ error: "Greška pri kreiranju stavke." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    const payload = req.body || {};
    const type = emptyToNull(payload.type);
    const model = emptyToNull(payload.model);
    if (!type || !model) {
      return res.status(400).json({ error: "Tip opreme i model su obavezni." });
    }

    const quantityRaw = Number(payload.quantity);
    const quantity =
      Number.isFinite(quantityRaw) && quantityRaw >= 1 ? quantityRaw : 1;

    const status = normalizeStatus(payload.status);

    const [result] = await pool.execute(
      `UPDATE inventory_items SET
         type = ?,
         manufacturer = ?,
         model = ?,
         serial_number = ?,
         quantity = ?,
         status = ?,
         capacity = ?,
         speed = ?,
         socket = ?,
         location = ?,
         notes = ?
       WHERE id = ?`,
      [
        type,
        emptyToNull(payload.manufacturer),
        model,
        emptyToNull(payload.serialNumber),
        quantity,
        status,
        emptyToNull(payload.capacity),
        emptyToNull(payload.speed),
        emptyToNull(payload.socket),
        emptyToNull(payload.location),
        emptyToNull(payload.notes),
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Stavka nije pronađena." });
    }

    const [rows] = await pool.execute(
      `SELECT
         id, type, manufacturer, model,
         serial_number AS serialNumber,
         quantity, status,
         capacity, speed, socket, location, notes,
         created_at AS createdAt, updated_at AS updatedAt
       FROM inventory_items
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    res.json(rows?.[0]);
  } catch (err) {
    console.error("Error updating inventory item:", err);
    res.status(500).json({ error: "Greška pri izmeni stavke." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    const [result] = await pool.execute(
      `DELETE FROM inventory_items WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Stavka nije pronađena." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting inventory item:", err);
    res.status(500).json({ error: "Greška pri brisanju stavke." });
  }
});

export default router;

