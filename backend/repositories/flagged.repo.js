import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// =========================
// Software
// =========================

export async function listFlaggedSoftware(search) {
  const { where, params } = buildLikeSearch(["display_name", "publisher"], search);
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      display_name AS displayName,
      publisher,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_software
    ${where ? `WHERE ${where}` : ""}
    ORDER BY display_name
    `,
    params,
  );
  return rows;
}

export async function findFlaggedSoftwareMatch(displayName, publisher) {
  const [rows] = await pool.execute(
    `
    SELECT id FROM flagged_software
    WHERE LOWER(display_name) = LOWER(?)
      AND (publisher IS NULL OR LOWER(publisher) = LOWER(?))
    LIMIT 1
    `,
    [displayName, publisher ?? ""],
  );
  return rows?.[0] || null;
}

export async function insertFlaggedSoftware({ displayName, publisher, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO flagged_software (display_name, publisher, reason, created_by_user_id)
    VALUES (?, ?, ?, ?)
    `,
    [displayName, publisher ?? null, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteFlaggedSoftware(id) {
  const [result] = await pool.execute(`DELETE FROM flagged_software WHERE id = ?`, [id]);
  return result.affectedRows;
}

// =========================
// Services
// =========================

export async function listFlaggedServices(search) {
  const { where, params } = buildLikeSearch(["name", "display_name"], search);
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      name,
      display_name AS displayName,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_services
    ${where ? `WHERE ${where}` : ""}
    ORDER BY name
    `,
    params,
  );
  return rows;
}

export async function findFlaggedServiceMatch(name) {
  const [rows] = await pool.execute(
    `SELECT id FROM flagged_services WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [name],
  );
  return rows?.[0] || null;
}

export async function insertFlaggedService({ name, displayName, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO flagged_services (name, display_name, reason, created_by_user_id)
    VALUES (?, ?, ?, ?)
    `,
    [name, displayName ?? null, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteFlaggedService(id) {
  const [result] = await pool.execute(`DELETE FROM flagged_services WHERE id = ?`, [id]);
  return result.affectedRows;
}

// =========================
// Drajveri
// =========================

export async function listFlaggedDrivers(search) {
  const { where, params } = buildLikeSearch(["device_name", "driver_provider_name"], search);
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      device_name AS deviceName,
      driver_provider_name AS driverProviderName,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_drivers
    ${where ? `WHERE ${where}` : ""}
    ORDER BY device_name
    `,
    params,
  );
  return rows;
}

export async function findFlaggedDriverMatch(deviceName, driverProviderName) {
  const [rows] = await pool.execute(
    `
    SELECT id FROM flagged_drivers
    WHERE LOWER(device_name) = LOWER(?)
      AND (driver_provider_name IS NULL OR LOWER(driver_provider_name) = LOWER(?))
    LIMIT 1
    `,
    [deviceName, driverProviderName ?? ""],
  );
  return rows?.[0] || null;
}

export async function insertFlaggedDriver({ deviceName, driverProviderName, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO flagged_drivers (device_name, driver_provider_name, reason, created_by_user_id)
    VALUES (?, ?, ?, ?)
    `,
    [deviceName, driverProviderName ?? null, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteFlaggedDriver(id) {
  const [result] = await pool.execute(`DELETE FROM flagged_drivers WHERE id = ?`, [id]);
  return result.affectedRows;
}
