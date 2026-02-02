import { pool } from "../db/pool.js";

export async function inventoryExportAll() {
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
    return items || [];
}

export async function inventoryFindById(id) {
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
    return rows?.[0] || null;
}

export async function inventoryListWithCounts({
  whereSql,
  params,
  sortKey,
  sortOrder,
  limit,
  offset,
}) {
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

  const [[countRows], [countsRows], [entries]] = await Promise.all([
    pool.execute(sqlCount, params),
    pool.execute(sqlCounts, params),
    pool.execute(sqlEntries, [...params, limit, offset]),
  ]);

  return { countRows, countsRows, entries };
}

export async function inventoryInsert(payload) {
    const [result] = await pool.execute(
        `INSERT INTO inventory_items
      (type, manufacturer, model, serial_number, quantity, status, capacity, speed, socket, location, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            payload.type,
            payload.manufacturer,
            payload.model,
            payload.serialNumber,
            payload.quantity,
            payload.status,
            payload.capacity,
            payload.speed,
            payload.socket,
            payload.location,
            payload.notes,
        ]
    );
    return result.insertId;
}

export async function inventoryUpdate(id, payload) {
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
            payload.type,
            payload.manufacturer,
            payload.model,
            payload.serialNumber,
            payload.quantity,
            payload.status,
            payload.capacity,
            payload.speed,
            payload.socket,
            payload.location,
            payload.notes,
            id,
        ]
    );
    return result.affectedRows;
}

export async function inventoryDelete(id) {
    const [result] = await pool.execute(`DELETE FROM inventory_items WHERE id = ?`, [id]);
    return result.affectedRows;
}
