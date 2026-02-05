import { pool } from "../db/pool.js";

function buildPrintersWhere(search = "") {
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

export async function getPrinterById(printerId) {
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
    [printerId],
  );
  if (!p) return null;

  let host = null;
  if (p.hostComputerId) {
    const [[h]] = await pool.execute(
      `SELECT id, ip, computer_name AS computerName, username, department
       FROM ip_entries
       WHERE id = ?
       LIMIT 1`,
      [p.hostComputerId],
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
    [printerId],
  );

  return {
    ...p,
    hostComputer: host,
    connectedComputers: connected || [],
    connectedCount: (connected || []).length,
  };
}

export async function listPrinters({ page, limit, search }) {
  const { where, params } = buildPrintersWhere(search);

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM printers p WHERE ${where}`,
    params,
  );

  const offset = (page - 1) * limit;

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
    [...params, limit, offset],
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

  return {
    items: mapped,
    total: Number(total) || 0,
  };
}

export async function insertPrinter(row) {
  const [r] = await pool.execute(
    `
    INSERT INTO printers
      (name, manufacturer, model, serial, department, connection_type, ip, ip_numeric, shared, host_computer_id)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.name,
      row.manufacturer,
      row.model,
      row.serial,
      row.department,
      row.connectionType,
      row.ip,
      row.ipNumeric,
      row.shared,
      row.hostComputerId,
    ],
  );
  return r.insertId;
}

export async function updatePrinterFields(id, fieldsSql, params) {
  const [r] = await pool.execute(
    `UPDATE printers SET ${fieldsSql} WHERE id = ?`,
    [...params, id],
  );
  return r.affectedRows;
}

export async function deletePrinter(id) {
  const [r] = await pool.execute(`DELETE FROM printers WHERE id = ?`, [id]);
  return r.affectedRows;
}

export async function setPrinterHost(id, hostComputerId) {
  const [r] = await pool.execute(
    `UPDATE printers SET host_computer_id = ? WHERE id = ?`,
    [hostComputerId, id],
  );
  return r.affectedRows;
}

export async function unsetPrinterHost(id) {
  const [r] = await pool.execute(
    `UPDATE printers SET host_computer_id = NULL WHERE id = ?`,
    [id],
  );
  return r.affectedRows;
}

export async function connectPrinterComputer(printerId, ipEntryId) {
  await pool.execute(
    `INSERT IGNORE INTO printer_connected_computers (printer_id, ip_entry_id) VALUES (?, ?)`,
    [printerId, ipEntryId],
  );
  await pool.execute(`UPDATE printers SET shared = 1 WHERE id = ?`, [
    printerId,
  ]);
}

export async function disconnectPrinterComputer(printerId, ipEntryId) {
  await pool.execute(
    `DELETE FROM printer_connected_computers WHERE printer_id = ? AND ip_entry_id = ?`,
    [printerId, ipEntryId],
  );
}

export async function updateSharedFromConnections(printerId) {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM printer_connected_computers WHERE printer_id = ?`,
    [printerId],
  );
  const shared = Number(cnt) > 0 ? 1 : 0;
  await pool.execute(`UPDATE printers SET shared = ? WHERE id = ?`, [
    shared,
    printerId,
  ]);
  return shared;
}

export async function exportPrintersData(search) {
  const { where, params } = buildPrintersWhere(search);

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
    params,
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
    [...params, ...params],
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
    `,
  );

  return {
    printers: printers || [],
    connections: connections || [],
    connAgg: connAgg || [],
  };
}
