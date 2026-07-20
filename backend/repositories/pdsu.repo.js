import { pool } from "../db/pool.js";

// =========================
// Computers
// =========================

export async function computerList(query = {}) {
  const [rows] = await pool.query(`
    SELECT
      id,
      ip,
      computer_name,
      os,
      department,
      is_online,
      last_checked,
      last_status_change,
      created_at,
      updated_at
    FROM ip_entries
    WHERE entry_type = 'computer'
    ORDER BY computer_name
  `);

  return rows;
}

export async function computerFindById(id) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      ip,
      computer_name,
      os,
      department,
      rdp_app,
      is_online,
      last_checked,
      last_status_change,
      created_at,
      updated_at,
      description
    FROM ip_entries
    WHERE id = ?
    `,
    [id],
  );

  return rows[0] ?? null;
}

// =========================
// Software
// =========================

export async function computerSoftwareList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      display_name,
      display_version,
      publisher,
      install_date,
      inventory_date
    FROM computer_software
    WHERE ip_entry_id = ?
    ORDER BY display_name
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerSoftwareDelete(ipEntryId) {
  const [result] = await pool.query(
    `
    DELETE FROM computer_software
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );

  return result.affectedRows;
}

export async function computerFindByIp(ip) {
  const [rows] = await pool.query(
    `
        SELECT
            id,
            ip,
            computer_name
        FROM ip_entries
        WHERE ip = ?
        `,
    [ip],
  );

  return rows[0] ?? null;
}

export async function computerSoftwareInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.display_name,
    item.display_version,
    item.publisher,
    item.install_date,
  ]);

  await pool.query(
    `
    INSERT INTO computer_software
    (
      ip_entry_id,
      display_name,
      display_version,
      publisher,
      install_date
    )
    VALUES ?
    `,
    [values],
  );
}

// =========================
// Drivers
// =========================

export async function computerDriversList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      device_name,
      driver_version,
      driver_date,
      manufacturer,
      driver_provider_name,
      inventory_date
    FROM computer_drivers
    WHERE ip_entry_id = ?
    ORDER BY device_name
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerDriversDelete(ipEntryId) {
  await pool.query(
    `
    DELETE FROM computer_drivers
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );
}

export async function computerDriversInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.device_name,
    item.driver_version,
    item.driver_date,
    item.manufacturer,
    item.driver_provider_name,
  ]);

  await pool.query(
    `
    INSERT INTO computer_drivers
    (
      ip_entry_id,
      device_name,
      driver_version,
      driver_date,
      manufacturer,
      driver_provider_name
    )
    VALUES ?
    `,
    [values],
  );
}

// =========================
// Services
// =========================

export async function computerServicesList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      name,
      display_name,
      state,
      start_mode,
      start_name,
      path_name,
      inventory_date
    FROM computer_services
    WHERE ip_entry_id = ?
    ORDER BY display_name
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerServicesDelete(ipEntryId) {
  await pool.query(
    `
    DELETE FROM computer_services
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );
}

export async function computerServicesInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.name,
    item.display_name,
    item.state,
    item.start_mode,
    item.start_name,
    item.path_name,
  ]);

  await pool.query(
    `
    INSERT INTO computer_services
    (
      ip_entry_id,
      name,
      display_name,
      state,
      start_mode,
      start_name,
      path_name
    )
    VALUES ?
    `,
    [values],
  );
}

// =========================
// Updates
// =========================

export async function computerUpdatesList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      description,
      hotfix_id,
      installed_on,
      installed_by,
      inventory_date
    FROM computer_updates
    WHERE ip_entry_id = ?
    ORDER BY installed_on DESC
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerUpdatesDelete(ipEntryId) {
  await pool.query(
    `
    DELETE FROM computer_updates
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );
}

export async function computerUpdatesInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.description,
    item.hotfix_id,
    item.installed_on,
    item.installed_by,
  ]);

  await pool.query(
    `
    INSERT INTO computer_updates
    (
      ip_entry_id,
      description,
      hotfix_id,
      installed_on,
      installed_by
    )
    VALUES ?
    `,
    [values],
  );
}

// =========================
// Printers (agent-detektovani, po računaru)
// =========================

export async function computerPrintersList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      name,
      driver_name,
      port_name,
      status,
      is_default,
      inventory_date
    FROM computer_printers
    WHERE ip_entry_id = ?
    ORDER BY is_default DESC, name
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerPrintersDelete(ipEntryId) {
  await pool.query(
    `
    DELETE FROM computer_printers
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );
}

export async function computerPrintersInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.name,
    item.driver_name,
    item.port_name,
    item.status,
    item.is_default,
  ]);

  await pool.query(
    `
    INSERT INTO computer_printers
    (
      ip_entry_id,
      name,
      driver_name,
      port_name,
      status,
      is_default
    )
    VALUES ?
    `,
    [values],
  );
}

// =========================
// Available Updates (dostupne, neinstalirane zakrpe)
// =========================

export async function computerAvailableUpdatesList(ipEntryId) {
  const [rows] = await pool.query(
    `
    SELECT
      id,
      kb_id,
      title,
      severity,
      inventory_date
    FROM computer_available_updates
    WHERE ip_entry_id = ?
    ORDER BY severity, title
    `,
    [ipEntryId],
  );

  return rows;
}

export async function computerAvailableUpdatesDelete(ipEntryId) {
  await pool.query(
    `
    DELETE FROM computer_available_updates
    WHERE ip_entry_id = ?
    `,
    [ipEntryId],
  );
}

export async function computerAvailableUpdatesInsert(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.kb_id,
    item.title,
    item.severity,
  ]);

  await pool.query(
    `
    INSERT INTO computer_available_updates
    (
      ip_entry_id,
      kb_id,
      title,
      severity
    )
    VALUES ?
    `,
    [values],
  );
}
