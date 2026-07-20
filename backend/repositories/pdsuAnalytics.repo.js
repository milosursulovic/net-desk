import { pool } from "../db/pool.js";

/**
 * Zajednička pokrivenost inventarom.
 */
export async function getInventoryCoverage() {
  const [[row]] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM ip_entries) AS totalComputers,

      (
        SELECT COUNT(DISTINCT ip_entry_id)
        FROM computer_software
      ) AS withSoftware,

      (
        SELECT COUNT(DISTINCT ip_entry_id)
        FROM computer_drivers
      ) AS withDrivers,

      (
        SELECT COUNT(DISTINCT ip_entry_id)
        FROM computer_services
      ) AS withServices,

      (
        SELECT COUNT(DISTINCT ip_entry_id)
        FROM computer_updates
      ) AS withUpdates
  `);

  return {
    totalComputers: Number(row?.totalComputers) || 0,
    withSoftware: Number(row?.withSoftware) || 0,
    withDrivers: Number(row?.withDrivers) || 0,
    withServices: Number(row?.withServices) || 0,
    withUpdates: Number(row?.withUpdates) || 0,
  };
}

/* =========================================================
   SOFTWARE
   ========================================================= */

export async function getSoftwareStats() {
  const [[row]] = await pool.execute(`
    SELECT
      COUNT(*) AS totalInstallations,

      COUNT(
        DISTINCT NULLIF(TRIM(display_name), '')
      ) AS uniqueSoftware,

      COUNT(DISTINCT ip_entry_id) AS computersWithSoftware,

      SUM(
        CASE
          WHEN publisher IS NULL OR TRIM(publisher) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutPublisher,

      SUM(
        CASE
          WHEN display_version IS NULL OR TRIM(display_version) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutVersion,

      MIN(inventory_date) AS oldestInventoryDate,
      MAX(inventory_date) AS newestInventoryDate

    FROM computer_software
  `);

  const totalInstallations = Number(row?.totalInstallations) || 0;
  const computersWithSoftware = Number(row?.computersWithSoftware) || 0;

  return {
    totalInstallations,
    uniqueSoftware: Number(row?.uniqueSoftware) || 0,
    computersWithSoftware,
    avgPerComputer: computersWithSoftware
      ? Math.round((totalInstallations / computersWithSoftware) * 10) / 10
      : 0,
    withoutPublisher: Number(row?.withoutPublisher) || 0,
    withoutVersion: Number(row?.withoutVersion) || 0,
    oldestInventoryDate: row?.oldestInventoryDate ?? null,
    newestInventoryDate: row?.newestInventoryDate ?? null,
  };
}

export async function getTopSoftware(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(display_name) AS name,
        COUNT(*) AS installations,
        COUNT(DISTINCT ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(display_version), '')
        ) AS versions
      FROM computer_software
      WHERE display_name IS NOT NULL
        AND TRIM(display_name) <> ''
      GROUP BY TRIM(display_name)
      ORDER BY computers DESC, installations DESC, name ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    name: row.name,
    installations: Number(row.installations) || 0,
    computers: Number(row.computers) || 0,
    versions: Number(row.versions) || 0,
  }));
}

export async function getTopPublishers(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        COALESCE(
          NULLIF(TRIM(publisher), ''),
          'Nepoznat izdavač'
        ) AS publisher,
        COUNT(*) AS installations,
        COUNT(DISTINCT ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(display_name), '')
        ) AS softwareCount
      FROM computer_software
      GROUP BY
        COALESCE(
          NULLIF(TRIM(publisher), ''),
          'Nepoznat izdavač'
        )
      ORDER BY installations DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    publisher: row.publisher,
    installations: Number(row.installations) || 0,
    computers: Number(row.computers) || 0,
    softwareCount: Number(row.softwareCount) || 0,
  }));
}

export async function getSoftwareMultipleVersions(limit = 20) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(display_name) AS name,
        COUNT(DISTINCT display_version) AS versionCount,
        COUNT(DISTINCT ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(display_version), '')
          ORDER BY display_version
          SEPARATOR ', '
        ) AS versions
      FROM computer_software
      WHERE display_name IS NOT NULL
        AND TRIM(display_name) <> ''
        AND display_version IS NOT NULL
        AND TRIM(display_version) <> ''
      GROUP BY TRIM(display_name)
      HAVING COUNT(DISTINCT display_version) > 1
      ORDER BY versionCount DESC, computers DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    name: row.name,
    versionCount: Number(row.versionCount) || 0,
    computers: Number(row.computers) || 0,
    versions: row.versions ?? "",
  }));
}

export async function getRareSoftware(limit = 20) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(cs.display_name) AS name,
        MAX(NULLIF(TRIM(cs.display_version), '')) AS version,
        MAX(NULLIF(TRIM(cs.publisher), '')) AS publisher,
        COUNT(DISTINCT cs.ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT COALESCE(
            NULLIF(TRIM(ip.computer_name), ''),
            ip.ip
          )
          ORDER BY ip.computer_name
          SEPARATOR ', '
        ) AS computerNames
      FROM computer_software cs
      JOIN ip_entries ip
        ON ip.id = cs.ip_entry_id
      WHERE cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
      GROUP BY TRIM(cs.display_name)
      HAVING COUNT(DISTINCT cs.ip_entry_id) <= 2
      ORDER BY computers ASC, name ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    name: row.name,
    version: row.version ?? null,
    publisher: row.publisher ?? null,
    computers: Number(row.computers) || 0,
    computerNames: row.computerNames ?? "",
  }));
}

export async function getComputersWithMostSoftware(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        COUNT(cs.id) AS softwareCount,
        MAX(cs.inventory_date) AS inventoryDate
      FROM ip_entries ip
      JOIN computer_software cs
        ON cs.ip_entry_id = ip.id
      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department
      ORDER BY softwareCount DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    softwareCount: Number(row.softwareCount) || 0,
    inventoryDate: row.inventoryDate ?? null,
  }));
}

/* =========================================================
   DRIVERS
   ========================================================= */

export async function getDriverStats() {
  const [[row]] = await pool.execute(`
    SELECT
      COUNT(*) AS totalDrivers,

      COUNT(
        DISTINCT NULLIF(TRIM(device_name), '')
      ) AS uniqueDevices,

      COUNT(DISTINCT ip_entry_id) AS computersWithDrivers,

      COUNT(
        DISTINCT NULLIF(TRIM(manufacturer), '')
      ) AS uniqueManufacturers,

      SUM(
        CASE
          WHEN manufacturer IS NULL OR TRIM(manufacturer) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutManufacturer,

      SUM(
        CASE
          WHEN driver_version IS NULL OR TRIM(driver_version) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutVersion,

      SUM(
        CASE
          WHEN driver_date IS NULL
          THEN 1
          ELSE 0
        END
      ) AS withoutDate,

      MIN(driver_date) AS oldestDriverDate,
      MAX(driver_date) AS newestDriverDate,
      MIN(inventory_date) AS oldestInventoryDate,
      MAX(inventory_date) AS newestInventoryDate

    FROM computer_drivers
  `);

  const totalDrivers = Number(row?.totalDrivers) || 0;
  const computersWithDrivers = Number(row?.computersWithDrivers) || 0;

  return {
    totalDrivers,
    uniqueDevices: Number(row?.uniqueDevices) || 0,
    computersWithDrivers,
    uniqueManufacturers: Number(row?.uniqueManufacturers) || 0,
    avgPerComputer: computersWithDrivers
      ? Math.round((totalDrivers / computersWithDrivers) * 10) / 10
      : 0,
    withoutManufacturer: Number(row?.withoutManufacturer) || 0,
    withoutVersion: Number(row?.withoutVersion) || 0,
    withoutDate: Number(row?.withoutDate) || 0,
    oldestDriverDate: row?.oldestDriverDate ?? null,
    newestDriverDate: row?.newestDriverDate ?? null,
    oldestInventoryDate: row?.oldestInventoryDate ?? null,
    newestInventoryDate: row?.newestInventoryDate ?? null,
  };
}

export async function getTopDriverManufacturers(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        COALESCE(
          NULLIF(TRIM(manufacturer), ''),
          NULLIF(TRIM(driver_provider_name), ''),
          'Nepoznat proizvođač'
        ) AS manufacturer,
        COUNT(*) AS drivers,
        COUNT(DISTINCT ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(device_name), '')
        ) AS devices
      FROM computer_drivers
      GROUP BY
        COALESCE(
          NULLIF(TRIM(manufacturer), ''),
          NULLIF(TRIM(driver_provider_name), ''),
          'Nepoznat proizvođač'
        )
      ORDER BY drivers DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    manufacturer: row.manufacturer,
    drivers: Number(row.drivers) || 0,
    computers: Number(row.computers) || 0,
    devices: Number(row.devices) || 0,
  }));
}

export async function getOldestDrivers(limit = 20) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        cd.device_name AS deviceName,
        cd.driver_version AS driverVersion,
        cd.driver_date AS driverDate,
        cd.manufacturer,
        cd.driver_provider_name AS driverProviderName,
        cd.inventory_date AS inventoryDate
      FROM computer_drivers cd
      JOIN ip_entries ip
        ON ip.id = cd.ip_entry_id
      WHERE cd.driver_date IS NOT NULL
      ORDER BY cd.driver_date ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    deviceName: row.deviceName,
    driverVersion: row.driverVersion,
    driverDate: row.driverDate,
    manufacturer: row.manufacturer,
    driverProviderName: row.driverProviderName,
    inventoryDate: row.inventoryDate,
  }));
}

export async function getDriverMultipleVersions(limit = 20) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(device_name) AS deviceName,
        COUNT(DISTINCT driver_version) AS versionCount,
        COUNT(DISTINCT ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(driver_version), '')
          ORDER BY driver_version
          SEPARATOR ', '
        ) AS versions,
        MAX(
          COALESCE(
            NULLIF(TRIM(manufacturer), ''),
            NULLIF(TRIM(driver_provider_name), '')
          )
        ) AS manufacturer
      FROM computer_drivers
      WHERE device_name IS NOT NULL
        AND TRIM(device_name) <> ''
        AND driver_version IS NOT NULL
        AND TRIM(driver_version) <> ''
      GROUP BY TRIM(device_name)
      HAVING COUNT(DISTINCT driver_version) > 1
      ORDER BY versionCount DESC, computers DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    deviceName: row.deviceName,
    manufacturer: row.manufacturer ?? null,
    versionCount: Number(row.versionCount) || 0,
    computers: Number(row.computers) || 0,
    versions: row.versions ?? "",
  }));
}

export async function getComputersWithMostDrivers(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        COUNT(cd.id) AS driverCount,
        MAX(cd.inventory_date) AS inventoryDate
      FROM ip_entries ip
      JOIN computer_drivers cd
        ON cd.ip_entry_id = ip.id
      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department
      ORDER BY driverCount DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    driverCount: Number(row.driverCount) || 0,
    inventoryDate: row.inventoryDate ?? null,
  }));
}

/* =========================================================
   SERVICES
   ========================================================= */

export async function getServiceStats() {
  const [[row]] = await pool.execute(`
    SELECT
      COUNT(*) AS totalServices,

      COUNT(
        DISTINCT NULLIF(TRIM(name), '')
      ) AS uniqueServices,

      COUNT(DISTINCT ip_entry_id) AS computersWithServices,

      SUM(
        CASE
          WHEN LOWER(TRIM(state)) = 'running'
          THEN 1
          ELSE 0
        END
      ) AS running,

      SUM(
        CASE
          WHEN LOWER(TRIM(state)) = 'stopped'
          THEN 1
          ELSE 0
        END
      ) AS stopped,

      SUM(
        CASE
          WHEN LOWER(TRIM(start_mode)) IN ('auto', 'automatic')
          THEN 1
          ELSE 0
        END
      ) AS automatic,

      SUM(
        CASE
          WHEN LOWER(TRIM(start_mode)) = 'manual'
          THEN 1
          ELSE 0
        END
      ) AS manual,

      SUM(
        CASE
          WHEN LOWER(TRIM(start_mode)) = 'disabled'
          THEN 1
          ELSE 0
        END
      ) AS disabled,

      SUM(
        CASE
          WHEN LOWER(TRIM(start_mode)) IN ('auto', 'automatic')
           AND LOWER(TRIM(state)) <> 'running'
          THEN 1
          ELSE 0
        END
      ) AS automaticStopped,

      MIN(inventory_date) AS oldestInventoryDate,
      MAX(inventory_date) AS newestInventoryDate

    FROM computer_services
  `);

  const totalServices = Number(row?.totalServices) || 0;
  const computersWithServices = Number(row?.computersWithServices) || 0;

  return {
    totalServices,
    uniqueServices: Number(row?.uniqueServices) || 0,
    computersWithServices,
    avgPerComputer: computersWithServices
      ? Math.round((totalServices / computersWithServices) * 10) / 10
      : 0,
    running: Number(row?.running) || 0,
    stopped: Number(row?.stopped) || 0,
    automatic: Number(row?.automatic) || 0,
    manual: Number(row?.manual) || 0,
    disabled: Number(row?.disabled) || 0,
    automaticStopped: Number(row?.automaticStopped) || 0,
    oldestInventoryDate: row?.oldestInventoryDate ?? null,
    newestInventoryDate: row?.newestInventoryDate ?? null,
  };
}

export async function getAutomaticStoppedServices(limit = 30) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        cs.name,
        cs.display_name AS displayName,
        cs.state,
        cs.start_mode AS startMode,
        cs.start_name AS startName,
        cs.path_name AS pathName,
        cs.inventory_date AS inventoryDate
      FROM computer_services cs
      JOIN ip_entries ip
        ON ip.id = cs.ip_entry_id
      WHERE LOWER(TRIM(cs.start_mode)) IN ('auto', 'automatic')
        AND LOWER(TRIM(cs.state)) <> 'running'
      ORDER BY
        ip.computer_name ASC,
        cs.display_name ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    name: row.name,
    displayName: row.displayName,
    state: row.state,
    startMode: row.startMode,
    startName: row.startName,
    pathName: row.pathName,
    inventoryDate: row.inventoryDate,
  }));
}

export async function getUnusualServicePaths(limit = 30) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        cs.name,
        cs.display_name AS displayName,
        cs.state,
        cs.start_mode AS startMode,
        cs.start_name AS startName,
        cs.path_name AS pathName,
        cs.inventory_date AS inventoryDate
      FROM computer_services cs
      JOIN ip_entries ip
        ON ip.id = cs.ip_entry_id
      WHERE cs.path_name IS NOT NULL
        AND TRIM(cs.path_name) <> ''

        AND LOWER(cs.path_name) NOT LIKE '%\\\\windows\\\\%'
        AND LOWER(cs.path_name) NOT LIKE '%\\\\program files\\\\%'
        AND LOWER(cs.path_name) NOT LIKE '%\\\\program files (x86)\\\\%'

      ORDER BY ip.computer_name ASC, cs.name ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    name: row.name,
    displayName: row.displayName,
    state: row.state,
    startMode: row.startMode,
    startName: row.startName,
    pathName: row.pathName,
    inventoryDate: row.inventoryDate,
  }));
}

export async function getRareServices(limit = 20) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(cs.name) AS name,
        MAX(cs.display_name) AS displayName,
        COUNT(DISTINCT cs.ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT COALESCE(
            NULLIF(TRIM(ip.computer_name), ''),
            ip.ip
          )
          ORDER BY ip.computer_name
          SEPARATOR ', '
        ) AS computerNames
      FROM computer_services cs
      JOIN ip_entries ip
        ON ip.id = cs.ip_entry_id
      WHERE cs.name IS NOT NULL
        AND TRIM(cs.name) <> ''
      GROUP BY TRIM(cs.name)
      HAVING COUNT(DISTINCT cs.ip_entry_id) <= 2
      ORDER BY computers ASC, name ASC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    name: row.name,
    displayName: row.displayName,
    computers: Number(row.computers) || 0,
    computerNames: row.computerNames ?? "",
  }));
}

/* =========================================================
   UPDATES
   ========================================================= */

export async function getUpdateStats() {
  const [[row]] = await pool.execute(`
    SELECT
      COUNT(*) AS totalUpdates,

      COUNT(
        DISTINCT NULLIF(TRIM(hotfix_id), '')
      ) AS uniqueHotfixes,

      COUNT(DISTINCT ip_entry_id) AS computersWithUpdates,

      SUM(
        CASE
          WHEN installed_on >= CURDATE() - INTERVAL 30 DAY
          THEN 1
          ELSE 0
        END
      ) AS installationsLast30Days,

      MIN(installed_on) AS oldestInstalledOn,
      MAX(installed_on) AS newestInstalledOn,
      MIN(inventory_date) AS oldestInventoryDate,
      MAX(inventory_date) AS newestInventoryDate

    FROM computer_updates
  `);

  return {
    totalUpdates: Number(row?.totalUpdates) || 0,
    uniqueHotfixes: Number(row?.uniqueHotfixes) || 0,
    computersWithUpdates: Number(row?.computersWithUpdates) || 0,
    installationsLast30Days: Number(row?.installationsLast30Days) || 0,
    oldestInstalledOn: row?.oldestInstalledOn ?? null,
    newestInstalledOn: row?.newestInstalledOn ?? null,
    oldestInventoryDate: row?.oldestInventoryDate ?? null,
    newestInventoryDate: row?.newestInventoryDate ?? null,
  };
}

export async function getUpdateFreshnessBuckets() {
  const [[row]] = await pool.execute(`
    SELECT
      SUM(
        CASE
          WHEN latestUpdate >= CURDATE() - INTERVAL 30 DAY
          THEN 1
          ELSE 0
        END
      ) AS last30Days,

      SUM(
        CASE
          WHEN latestUpdate < CURDATE() - INTERVAL 30 DAY
           AND latestUpdate >= CURDATE() - INTERVAL 60 DAY
          THEN 1
          ELSE 0
        END
      ) AS days31To60,

      SUM(
        CASE
          WHEN latestUpdate < CURDATE() - INTERVAL 60 DAY
           AND latestUpdate >= CURDATE() - INTERVAL 90 DAY
          THEN 1
          ELSE 0
        END
      ) AS days61To90,

      SUM(
        CASE
          WHEN latestUpdate < CURDATE() - INTERVAL 90 DAY
          THEN 1
          ELSE 0
        END
      ) AS olderThan90Days

    FROM (
      SELECT
        ip_entry_id,
        MAX(installed_on) AS latestUpdate
      FROM computer_updates
      WHERE installed_on IS NOT NULL
      GROUP BY ip_entry_id
    ) latest
  `);

  const [[missingRow]] = await pool.execute(`
    SELECT COUNT(*) AS withoutData
    FROM ip_entries ip
    WHERE NOT EXISTS (
      SELECT 1
      FROM computer_updates cu
      WHERE cu.ip_entry_id = ip.id
    )
  `);

  return {
    last30Days: Number(row?.last30Days) || 0,
    days31To60: Number(row?.days31To60) || 0,
    days61To90: Number(row?.days61To90) || 0,
    olderThan90Days: Number(row?.olderThan90Days) || 0,
    withoutData: Number(missingRow?.withoutData) || 0,
  };
}

export async function getTopHotfixes(limit = 10) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(hotfix_id) AS hotfixId,
        MAX(description) AS description,
        COUNT(*) AS installations,
        COUNT(DISTINCT ip_entry_id) AS computers,
        MIN(installed_on) AS firstInstalledOn,
        MAX(installed_on) AS lastInstalledOn
      FROM computer_updates
      WHERE hotfix_id IS NOT NULL
        AND TRIM(hotfix_id) <> ''
      GROUP BY TRIM(hotfix_id)
      ORDER BY computers DESC, installations DESC
      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    hotfixId: row.hotfixId,
    description: row.description,
    installations: Number(row.installations) || 0,
    computers: Number(row.computers) || 0,
    firstInstalledOn: row.firstInstalledOn,
    lastInstalledOn: row.lastInstalledOn,
  }));
}

export async function getLatestUpdateByComputer(limit = 200) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,

        COUNT(cu.id) AS updateCount,
        MAX(cu.installed_on) AS latestInstalledOn,
        MAX(cu.inventory_date) AS inventoryDate,

        SUBSTRING_INDEX(
          GROUP_CONCAT(
            NULLIF(TRIM(cu.hotfix_id), '')
            ORDER BY cu.installed_on DESC, cu.id DESC
            SEPARATOR ','
          ),
          ',',
          1
        ) AS latestHotfixId

      FROM ip_entries ip
      LEFT JOIN computer_updates cu
        ON cu.ip_entry_id = ip.id

      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department

      ORDER BY
        MAX(cu.installed_on) IS NULL DESC,
        MAX(cu.installed_on) ASC

      LIMIT ?
    `,
    [limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    updateCount: Number(row.updateCount) || 0,
    latestInstalledOn: row.latestInstalledOn ?? null,
    latestHotfixId: row.latestHotfixId ?? null,
    inventoryDate: row.inventoryDate ?? null,
  }));
}

export async function getStaleUpdateComputers(staleDays = 90, limit = 50) {
  const safeDays = Math.max(1, Math.min(Number(staleDays) || 90, 3650));

  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        COUNT(cu.id) AS updateCount,
        MAX(cu.installed_on) AS latestInstalledOn,
        MAX(cu.inventory_date) AS inventoryDate
      FROM ip_entries ip
      LEFT JOIN computer_updates cu
        ON cu.ip_entry_id = ip.id
      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department
      HAVING
        MAX(cu.installed_on) IS NULL
        OR MAX(cu.installed_on) < CURDATE() - INTERVAL ? DAY
      ORDER BY
        MAX(cu.installed_on) IS NULL DESC,
        MAX(cu.installed_on) ASC
      LIMIT ?
    `,
    [safeDays, limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    updateCount: Number(row.updateCount) || 0,
    latestInstalledOn: row.latestInstalledOn ?? null,
    inventoryDate: row.inventoryDate ?? null,
  }));
}
