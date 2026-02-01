import express from "express";
import { pool } from "../index.js";
import { ah } from "../utils/asyncHandler.js";
import XLSX from "xlsx";
import { isValidIPv4, ipToNumeric } from "../utils/ip.js";

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

function autosizeSheet(worksheet, headerKeys) {
  if (!worksheet || !headerKeys || headerKeys.length === 0) return;
  const colWidths = headerKeys.map((h) => (h ? String(h).length : 10));

  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let max = colWidths[C - range.s.c] || 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || cell.v == null) continue;
      const len = String(cell.v).length;
      if (len > max) max = len;
    }
    colWidths[C - range.s.c] = Math.min(Math.max(max + 2, 10), 60);
  }
  worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
}

function buildWhereAndParams(search = "") {
  const q = String(search || "").trim();
  if (!q) return { where: "1=1", params: [] };

  const like = `%${q}%`;
  const ipPrefix = `${q}%`;

  return {
    where: `
      (
        p.ip LIKE ?
        OR p.name LIKE ?
        OR p.manufacturer LIKE ?
        OR p.model LIKE ?
        OR p.serial LIKE ?
        OR p.department LIKE ?
      )
    `,
    params: [ipPrefix, like, like, like, like, like],
  };
}

async function findIpEntryByIpOrId(ipOrId) {
  const v = String(ipOrId || "").trim();
  if (!v) return null;

  if (isValidIPv4(v)) {
    const [[row]] = await pool.execute(
      `SELECT id, ip, computer_name AS computerName, username, department
       FROM ip_entries
       WHERE ip = ?
       LIMIT 1`,
      [v]
    );
    return row || null;
  }

  if (/^\d+$/.test(v)) {
    const asId = Number(v);
    if (asId > 0) {
      const [[row]] = await pool.execute(
        `SELECT id, ip, computer_name AS computerName, username, department
         FROM ip_entries
         WHERE id = ?
         LIMIT 1`,
        [asId]
      );
      return row || null;
    }
  }

  return null;
}

async function getPrinterById(printerId) {
  const [[p]] = await pool.execute(
    `
    SELECT
      p.id,
      p.name,
      p.manufacturer,
      p.model,
      p.serial,
      p.department,
      p.connection_type AS connectionType,
      p.ip,
      p.ip_numeric AS ipNumeric,
      p.shared,
      p.host_computer_id AS hostComputerId,
      p.created_at AS createdAt,
      p.updated_at AS updatedAt
    FROM printers p
    WHERE p.id = ?
    LIMIT 1
    `,
    [printerId]
  );
  if (!p) return null;

  let host = null;
  if (p.hostComputerId) {
    const [[h]] = await pool.execute(
      `SELECT id, ip, computer_name AS computerName, username, department
       FROM ip_entries
       WHERE id = ?
       LIMIT 1`,
      [p.hostComputerId]
    );
    host = h || null;
  }

  const [connected] = await pool.execute(
    `
    SELECT
      ie.id,
      ie.ip,
      ie.computer_name AS computerName,
      ie.username,
      ie.department
    FROM printer_connected_computers pc
    JOIN ip_entries ie ON ie.id = pc.ip_entry_id
    WHERE pc.printer_id = ?
    ORDER BY ie.ip_numeric ASC
    `,
    [printerId]
  );

  return {
    ...p,
    hostComputer: host,
    connectedComputers: connected || [],
    connectedCount: (connected || []).length,
  };
}

async function updateSharedFromConnections(printerId) {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM printer_connected_computers WHERE printer_id = ?`,
    [printerId]
  );
  const shared = Number(cnt) > 0 ? 1 : 0;
  await pool.execute(`UPDATE printers SET shared = ? WHERE id = ?`, [
    shared,
    printerId,
  ]);
  return shared;
}

router.get(
  "/export-xlsx",
  ah(async (req, res) => {
    const search = String(req.query.search || "");
    const { where, params } = buildWhereAndParams(search);

    const [printers] = await pool.execute(
      `
      SELECT
        p.id,
        p.name,
        p.manufacturer,
        p.model,
        p.serial,
        p.department,
        p.connection_type AS connectionType,
        p.ip,
        p.shared,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,

        h.computer_name AS hostComputerName,
        h.ip AS hostIp
      FROM printers p
      LEFT JOIN ip_entries h ON h.id = p.host_computer_id
      WHERE ${where}
      ORDER BY p.ip_numeric ASC, p.name ASC
      `,
      params
    );

    const [connections] = await pool.execute(
      `
      SELECT
        p.name AS PrinterName,
        p.ip AS PrinterIP,
        'HOST' AS Role,
        h.computer_name AS ComputerName,
        h.ip AS ComputerIP,
        h.department AS Department
      FROM printers p
      JOIN ip_entries h ON h.id = p.host_computer_id
      WHERE ${where}

      UNION ALL

      SELECT
        p.name AS PrinterName,
        p.ip AS PrinterIP,
        'CONNECTED' AS Role,
        ie.computer_name AS ComputerName,
        ie.ip AS ComputerIP,
        ie.department AS Department
      FROM printers p
      JOIN printer_connected_computers pc ON pc.printer_id = p.id
      JOIN ip_entries ie ON ie.id = pc.ip_entry_id
      WHERE ${where}

      ORDER BY PrinterName ASC, Role ASC, ComputerName ASC
      `,
      [...params, ...params]
    );

    const [connAgg] = await pool.execute(
      `
      SELECT
        pc.printer_id AS printerId,
        COUNT(*) AS connectedCount,
        GROUP_CONCAT(
          CONCAT(
            COALESCE(ie.computer_name,''),
            CASE WHEN ie.computer_name IS NOT NULL AND ie.computer_name <> '' AND ie.ip IS NOT NULL AND ie.ip <> '' THEN ' ' ELSE '' END,
            CASE WHEN ie.ip IS NOT NULL AND ie.ip <> '' THEN CONCAT('(', ie.ip, ')') ELSE '' END
          )
          ORDER BY ie.ip_numeric ASC
          SEPARATOR ', '
        ) AS connectedList
      FROM printer_connected_computers pc
      JOIN ip_entries ie ON ie.id = pc.ip_entry_id
      GROUP BY pc.printer_id
      `
    );

    const connMap = new Map(
      connAgg.map((r) => [
        Number(r.printerId),
        {
          connectedCount: Number(r.connectedCount) || 0,
          connectedList: r.connectedList || "",
        },
      ])
    );

    const printerRows = printers.map((p) => {
      const extra = connMap.get(Number(p.id)) || {
        connectedCount: 0,
        connectedList: "",
      };

      return {
        Name: p.name || "",
        Manufacturer: p.manufacturer || "",
        Model: p.model || "",
        Serial: p.serial || "",
        Department: p.department || "",
        ConnectionType: p.connectionType || "",
        IP: p.ip || "",
        Shared: !!p.shared,
        Host_ComputerName: p.hostComputerName || "",
        Host_IP: p.hostIp || "",
        ConnectedCount: extra.connectedCount,
        ConnectedList: extra.connectedList,
        UpdatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
        CreatedAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
      };
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(printerRows);
    autosizeSheet(ws1, Object.keys(printerRows[0] || {}));
    XLSX.utils.book_append_sheet(wb, ws1, "Printers");

    const ws2 = XLSX.utils.json_to_sheet(connections);
    autosizeSheet(
      ws2,
      Object.keys(
        connections[0] || {
          PrinterName: "",
          PrinterIP: "",
          Role: "",
          ComputerName: "",
          ComputerIP: "",
          Department: "",
        }
      )
    );
    XLSX.utils.book_append_sheet(wb, ws2, "Connections");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `NetDesk_Printers_${dateStamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  })
);

router.get(
  "/",
  ah(async (req, res) => {
    const rawPage = toInt(req.query.page, 1);
    const rawLimit = toInt(req.query.limit, 50);
    const search = String(req.query.search || "");

    const page = clamp(rawPage || 1, 1, 1_000_000);
    const limit = clamp(rawLimit || 50, 1, 1000);
    const offset = (page - 1) * limit;

    const { where, params } = buildWhereAndParams(search);

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM printers p WHERE ${where}`,
      params
    );

    const [items] = await pool.execute(
      `
      SELECT
        p.id,
        p.name,
        p.manufacturer,
        p.model,
        p.serial,
        p.department,
        p.connection_type AS connectionType,
        p.ip,
        p.ip_numeric AS ipNumeric,
        p.shared,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt,

        h.id AS hostId,
        h.ip AS hostIp,
        h.computer_name AS hostComputerName,
        h.username AS hostUsername,
        h.department AS hostDepartment,

        (
          SELECT COUNT(*)
          FROM printer_connected_computers pc
          WHERE pc.printer_id = p.id
        ) AS connectedCount
      FROM printers p
      LEFT JOIN ip_entries h ON h.id = p.host_computer_id
      WHERE ${where}
      ORDER BY p.ip_numeric ASC, p.name ASC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    const mapped = items.map((p) => ({
      ...p,
      host: p.hostId
        ? {
            id: p.hostId,
            ip: p.hostIp,
            computerName: p.hostComputerName,
            username: p.hostUsername,
            department: p.hostDepartment,
          }
        : null,
    }));

    for (const it of mapped) {
      delete it.hostId;
      delete it.hostIp;
      delete it.hostComputerName;
      delete it.hostUsername;
      delete it.hostDepartment;
    }

    res.json({
      items: mapped,
      page,
      limit,
      search,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  })
);

router.get(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "Invalid printer id" });

    const p = await getPrinterById(id);
    if (!p) return res.status(404).json({ error: "Printer not found" });

    res.json(p);
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const body = req.body || {};

    const ip = emptyToNull(body.ip);
    const ipNumeric = ip && isValidIPv4(ip) ? ipToNumeric(ip) : null;

    const insert = {
      name: emptyToNull(body.name),
      manufacturer: emptyToNull(body.manufacturer),
      model: emptyToNull(body.model),
      serial: emptyToNull(body.serial),
      department: emptyToNull(body.department),
      connectionType: emptyToNull(body.connectionType) ?? "Network",
      ip,
      ipNumeric,
      shared: body.shared ? 1 : 0,
      hostComputerId: body.hostComputerId ?? null,
    };

    const [r] = await pool.execute(
      `
      INSERT INTO printers
        (name, manufacturer, model, serial, department, connection_type, ip, ip_numeric, shared, host_computer_id)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        insert.name,
        insert.manufacturer,
        insert.model,
        insert.serial,
        insert.department,
        insert.connectionType,
        insert.ip,
        insert.ipNumeric,
        insert.shared,
        insert.hostComputerId,
      ]
    );

    const created = await getPrinterById(r.insertId);
    res.status(201).json(created);
  })
);

router.put(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "Invalid printer id" });

    const body = req.body || {};
    const fields = [];
    const params = [];

    const setIf = (col, val) => {
      fields.push(`${col} = ?`);
      params.push(val);
    };

    if ("name" in body) setIf("name", emptyToNull(body.name));
    if ("manufacturer" in body) setIf("manufacturer", emptyToNull(body.manufacturer));
    if ("model" in body) setIf("model", emptyToNull(body.model));
    if ("serial" in body) setIf("serial", emptyToNull(body.serial));
    if ("department" in body) setIf("department", emptyToNull(body.department));
    if ("connectionType" in body) setIf("connection_type", emptyToNull(body.connectionType) ?? "Network");

    if ("ip" in body) {
      const ip = emptyToNull(body.ip);
      setIf("ip", ip);
      setIf("ip_numeric", ip && isValidIPv4(ip) ? ipToNumeric(ip) : null);
    }

    if ("shared" in body) setIf("shared", body.shared ? 1 : 0);
    if ("hostComputerId" in body) setIf("host_computer_id", body.hostComputerId ?? null);

    if (fields.length === 0) {
      const current = await getPrinterById(id);
      if (!current) return res.status(404).json({ error: "Printer not found" });
      return res.json(current);
    }

    params.push(id);
    const [r] = await pool.execute(
      `UPDATE printers SET ${fields.join(", ")} WHERE id = ?`,
      params
    );

    if (r.affectedRows === 0)
      return res.status(404).json({ error: "Printer not found" });

    const updated = await getPrinterById(id);
    res.json(updated);
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    const id = toInt(req.params.id, null);
    if (!id) return res.status(400).json({ error: "Invalid printer id" });

    const [r] = await pool.execute(`DELETE FROM printers WHERE id = ?`, [id]);
    if (r.affectedRows === 0)
      return res.status(404).json({ error: "Printer not found" });

    res.json({ message: "Printer deleted" });
  })
);

router.post(
  "/:id/set-host",
  ah(async (req, res) => {
    const printerId = toInt(req.params.id, null);
    if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

    const { computer } = req.body || {};
    const host = await findIpEntryByIpOrId(computer);
    if (!host)
      return res.status(404).json({ error: "Host computer not found (use IPv4 or numeric id)" });

    const [r] = await pool.execute(
      `UPDATE printers SET host_computer_id = ? WHERE id = ?`,
      [host.id, printerId]
    );
    if (r.affectedRows === 0)
      return res.status(404).json({ error: "Printer not found" });

    const updated = await getPrinterById(printerId);
    res.json(updated);
  })
);

router.post(
  "/:id/unset-host",
  ah(async (req, res) => {
    const printerId = toInt(req.params.id, null);
    if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

    const [r] = await pool.execute(
      `UPDATE printers SET host_computer_id = NULL WHERE id = ?`,
      [printerId]
    );
    if (r.affectedRows === 0)
      return res.status(404).json({ error: "Printer not found" });

    const updated = await getPrinterById(printerId);
    res.json(updated);
  })
);

router.post(
  "/:id/connect",
  ah(async (req, res) => {
    const printerId = toInt(req.params.id, null);
    if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

    const { computer } = req.body || {};
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc)
      return res.status(404).json({ error: "Computer not found (use IPv4 or numeric id)" });

    await pool.execute(
      `INSERT IGNORE INTO printer_connected_computers (printer_id, ip_entry_id) VALUES (?, ?)`,
      [printerId, pc.id]
    );

    await pool.execute(`UPDATE printers SET shared = 1 WHERE id = ?`, [
      printerId,
    ]);

    const updated = await getPrinterById(printerId);
    if (!updated) return res.status(404).json({ error: "Printer not found" });

    res.json(updated);
  })
);

router.post(
  "/:id/disconnect",
  ah(async (req, res) => {
    const printerId = toInt(req.params.id, null);
    if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

    const { computer } = req.body || {};
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc)
      return res.status(404).json({ error: "Computer not found (use IPv4 or numeric id)" });

    await pool.execute(
      `DELETE FROM printer_connected_computers WHERE printer_id = ? AND ip_entry_id = ?`,
      [printerId, pc.id]
    );

    await updateSharedFromConnections(printerId);

    const updated = await getPrinterById(printerId);
    if (!updated) return res.status(404).json({ error: "Printer not found" });

    res.json(updated);
  })
);

export default router;

