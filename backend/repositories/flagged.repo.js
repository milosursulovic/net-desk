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

export async function findAgentIdsForFlaggedSoftware(id, site) {
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT agents.id AS agentId
    FROM flagged_software fs
    JOIN computer_software cs
      ON LOWER(cs.display_name) LIKE CONCAT('%', LOWER(fs.display_name), '%')
     AND (fs.publisher IS NULL OR LOWER(cs.publisher) = LOWER(fs.publisher))
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    JOIN agents ON agents.ip_entry_id = ie.id AND agents.status = 'active'
    WHERE fs.id = ?
      AND NOT EXISTS (
        SELECT 1 FROM flagged_software_exceptions fse
        WHERE fse.flagged_software_id = fs.id AND fse.ip_entry_id = ie.id
      )
      ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [id, site] : [id],
  );
  return rows.map((r) => r.agentId);
}

// =========================
// Izuzeci po računaru - "ovo NIJE neželjeno na OVOM računaru", global flag
// ostaje netaknut za sve ostale. Jedna tabela po entitetu (0008 migracija),
// isti CRUD obrazac za sva tri (software/services/drivers).
// =========================

export async function addFlaggedSoftwareException(flaggedSoftwareId, ipEntryId, createdByUserId) {
  await pool.execute(
    `
    INSERT IGNORE INTO flagged_software_exceptions (flagged_software_id, ip_entry_id, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [flaggedSoftwareId, ipEntryId, createdByUserId ?? null],
  );
}

export async function removeFlaggedSoftwareException(flaggedSoftwareId, ipEntryId) {
  const [result] = await pool.execute(
    `DELETE FROM flagged_software_exceptions WHERE flagged_software_id = ? AND ip_entry_id = ?`,
    [flaggedSoftwareId, ipEntryId],
  );
  return result.affectedRows;
}

export async function listFlaggedSoftwareExceptionsForIpEntry(ipEntryId) {
  const [rows] = await pool.execute(
    `
    SELECT fs.id, fs.display_name AS displayName, fs.publisher
    FROM flagged_software_exceptions fse
    JOIN flagged_software fs ON fs.id = fse.flagged_software_id
    WHERE fse.ip_entry_id = ?
    ORDER BY fs.display_name
    `,
    [ipEntryId],
  );
  return rows;
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

export async function findAgentIdsForFlaggedService(id, site) {
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT agents.id AS agentId
    FROM flagged_services fsv
    JOIN computer_services cs
      ON LOWER(cs.name) LIKE CONCAT('%', LOWER(fsv.name), '%')
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    JOIN agents ON agents.ip_entry_id = ie.id AND agents.status = 'active'
    WHERE fsv.id = ?
      AND NOT EXISTS (
        SELECT 1 FROM flagged_services_exceptions fsve
        WHERE fsve.flagged_service_id = fsv.id AND fsve.ip_entry_id = ie.id
      )
      ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [id, site] : [id],
  );
  return rows.map((r) => r.agentId);
}

export async function addFlaggedServiceException(flaggedServiceId, ipEntryId, createdByUserId) {
  await pool.execute(
    `
    INSERT IGNORE INTO flagged_services_exceptions (flagged_service_id, ip_entry_id, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [flaggedServiceId, ipEntryId, createdByUserId ?? null],
  );
}

export async function removeFlaggedServiceException(flaggedServiceId, ipEntryId) {
  const [result] = await pool.execute(
    `DELETE FROM flagged_services_exceptions WHERE flagged_service_id = ? AND ip_entry_id = ?`,
    [flaggedServiceId, ipEntryId],
  );
  return result.affectedRows;
}

export async function listFlaggedServiceExceptionsForIpEntry(ipEntryId) {
  const [rows] = await pool.execute(
    `
    SELECT fsv.id, fsv.name, fsv.display_name AS displayName
    FROM flagged_services_exceptions fsve
    JOIN flagged_services fsv ON fsv.id = fsve.flagged_service_id
    WHERE fsve.ip_entry_id = ?
    ORDER BY fsv.name
    `,
    [ipEntryId],
  );
  return rows;
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

export async function findAgentIdsForFlaggedDriver(id, site) {
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT agents.id AS agentId
    FROM flagged_drivers fd
    JOIN computer_drivers cd
      ON LOWER(cd.device_name) LIKE CONCAT('%', LOWER(fd.device_name), '%')
     AND (fd.driver_provider_name IS NULL OR LOWER(cd.driver_provider_name) = LOWER(fd.driver_provider_name))
    JOIN ip_entries ie ON ie.id = cd.ip_entry_id
    JOIN agents ON agents.ip_entry_id = ie.id AND agents.status = 'active'
    WHERE fd.id = ?
      AND NOT EXISTS (
        SELECT 1 FROM flagged_drivers_exceptions fde
        WHERE fde.flagged_driver_id = fd.id AND fde.ip_entry_id = ie.id
      )
      ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [id, site] : [id],
  );
  return rows.map((r) => r.agentId);
}

export async function addFlaggedDriverException(flaggedDriverId, ipEntryId, createdByUserId) {
  await pool.execute(
    `
    INSERT IGNORE INTO flagged_drivers_exceptions (flagged_driver_id, ip_entry_id, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [flaggedDriverId, ipEntryId, createdByUserId ?? null],
  );
}

export async function removeFlaggedDriverException(flaggedDriverId, ipEntryId) {
  const [result] = await pool.execute(
    `DELETE FROM flagged_drivers_exceptions WHERE flagged_driver_id = ? AND ip_entry_id = ?`,
    [flaggedDriverId, ipEntryId],
  );
  return result.affectedRows;
}

export async function listFlaggedDriverExceptionsForIpEntry(ipEntryId) {
  const [rows] = await pool.execute(
    `
    SELECT fd.id, fd.device_name AS deviceName, fd.driver_provider_name AS driverProviderName
    FROM flagged_drivers_exceptions fde
    JOIN flagged_drivers fd ON fd.id = fde.flagged_driver_id
    WHERE fde.ip_entry_id = ?
    ORDER BY fd.device_name
    `,
    [ipEntryId],
  );
  return rows;
}
