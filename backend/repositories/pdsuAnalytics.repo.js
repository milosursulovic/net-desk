import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

/**
 * Zajednička pokrivenost inventarom.
 */
export async function getPdsuCoverage() {
  const [[row]] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM ip_entries WHERE entry_type = 'computer') AS totalComputers,

      (
        SELECT COUNT(DISTINCT cs.ip_entry_id)
        FROM computer_software cs
        JOIN ip_entries ie ON ie.id = cs.ip_entry_id
        WHERE ie.entry_type = 'computer'
      ) AS withSoftware,

      (
        SELECT COUNT(DISTINCT cd.ip_entry_id)
        FROM computer_drivers cd
        JOIN ip_entries ie ON ie.id = cd.ip_entry_id
        WHERE ie.entry_type = 'computer'
      ) AS withDrivers,

      (
        SELECT COUNT(DISTINCT csv.ip_entry_id)
        FROM computer_services csv
        JOIN ip_entries ie ON ie.id = csv.ip_entry_id
        WHERE ie.entry_type = 'computer'
      ) AS withServices,

      (
        SELECT COUNT(DISTINCT cu.ip_entry_id)
        FROM computer_updates cu
        JOIN ip_entries ie ON ie.id = cu.ip_entry_id
        WHERE ie.entry_type = 'computer'
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
        DISTINCT NULLIF(TRIM(cs.display_name), '')
      ) AS uniqueSoftware,

      COUNT(DISTINCT cs.ip_entry_id) AS computersWithSoftware,

      SUM(
        CASE
          WHEN cs.publisher IS NULL OR TRIM(cs.publisher) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutPublisher,

      SUM(
        CASE
          WHEN cs.display_version IS NULL OR TRIM(cs.display_version) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutVersion,

      MIN(cs.inventory_date) AS oldestInventoryDate,
      MAX(cs.inventory_date) AS newestInventoryDate

    FROM computer_software cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer'
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
        TRIM(cs.display_name) AS name,
        COUNT(*) AS installations,
        COUNT(DISTINCT cs.ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(cs.display_version), '')
        ) AS versions
      FROM computer_software cs
      JOIN ip_entries ie ON ie.id = cs.ip_entry_id
      WHERE ie.entry_type = 'computer'
        AND cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
      GROUP BY TRIM(cs.display_name)
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
          NULLIF(TRIM(cs.publisher), ''),
          'Nepoznat izdavač'
        ) AS publisher,
        COUNT(*) AS installations,
        COUNT(DISTINCT cs.ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(cs.display_name), '')
        ) AS softwareCount
      FROM computer_software cs
      JOIN ip_entries ie ON ie.id = cs.ip_entry_id
      WHERE ie.entry_type = 'computer'
      GROUP BY
        COALESCE(
          NULLIF(TRIM(cs.publisher), ''),
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
        TRIM(cs.display_name) AS name,
        COUNT(DISTINCT cs.display_version) AS versionCount,
        COUNT(DISTINCT cs.ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(cs.display_version), '')
          ORDER BY cs.display_version
          SEPARATOR ', '
        ) AS versions
      FROM computer_software cs
      JOIN ip_entries ie ON ie.id = cs.ip_entry_id
      WHERE ie.entry_type = 'computer'
        AND cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
        AND cs.display_version IS NOT NULL
        AND TRIM(cs.display_version) <> ''
      GROUP BY TRIM(cs.display_name)
      HAVING COUNT(DISTINCT cs.display_version) > 1
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
      WHERE ip.entry_type = 'computer'
        AND cs.display_name IS NOT NULL
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
      WHERE ip.entry_type = 'computer'
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
        DISTINCT NULLIF(TRIM(cd.device_name), '')
      ) AS uniqueDevices,

      COUNT(DISTINCT cd.ip_entry_id) AS computersWithDrivers,

      COUNT(
        DISTINCT NULLIF(TRIM(cd.manufacturer), '')
      ) AS uniqueManufacturers,

      SUM(
        CASE
          WHEN cd.manufacturer IS NULL OR TRIM(cd.manufacturer) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutManufacturer,

      SUM(
        CASE
          WHEN cd.driver_version IS NULL OR TRIM(cd.driver_version) = ''
          THEN 1
          ELSE 0
        END
      ) AS withoutVersion,

      SUM(
        CASE
          WHEN cd.driver_date IS NULL
          THEN 1
          ELSE 0
        END
      ) AS withoutDate,

      MIN(cd.driver_date) AS oldestDriverDate,
      MAX(cd.driver_date) AS newestDriverDate,
      MIN(cd.inventory_date) AS oldestInventoryDate,
      MAX(cd.inventory_date) AS newestInventoryDate

    FROM computer_drivers cd
    JOIN ip_entries ie ON ie.id = cd.ip_entry_id
    WHERE ie.entry_type = 'computer'
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
          NULLIF(TRIM(cd.manufacturer), ''),
          NULLIF(TRIM(cd.driver_provider_name), ''),
          'Nepoznat proizvođač'
        ) AS manufacturer,
        COUNT(*) AS drivers,
        COUNT(DISTINCT cd.ip_entry_id) AS computers,
        COUNT(
          DISTINCT NULLIF(TRIM(cd.device_name), '')
        ) AS devices
      FROM computer_drivers cd
      JOIN ip_entries ie ON ie.id = cd.ip_entry_id
      WHERE ie.entry_type = 'computer'
      GROUP BY
        COALESCE(
          NULLIF(TRIM(cd.manufacturer), ''),
          NULLIF(TRIM(cd.driver_provider_name), ''),
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
      WHERE ip.entry_type = 'computer'
        AND cd.driver_date IS NOT NULL
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
        TRIM(cd.device_name) AS deviceName,
        COUNT(DISTINCT cd.driver_version) AS versionCount,
        COUNT(DISTINCT cd.ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT NULLIF(TRIM(cd.driver_version), '')
          ORDER BY cd.driver_version
          SEPARATOR ', '
        ) AS versions,
        MAX(
          COALESCE(
            NULLIF(TRIM(cd.manufacturer), ''),
            NULLIF(TRIM(cd.driver_provider_name), '')
          )
        ) AS manufacturer
      FROM computer_drivers cd
      JOIN ip_entries ie ON ie.id = cd.ip_entry_id
      WHERE ie.entry_type = 'computer'
        AND cd.device_name IS NOT NULL
        AND TRIM(cd.device_name) <> ''
        AND cd.driver_version IS NOT NULL
        AND TRIM(cd.driver_version) <> ''
      GROUP BY TRIM(cd.device_name)
      HAVING COUNT(DISTINCT cd.driver_version) > 1
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
      WHERE ip.entry_type = 'computer'
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
        DISTINCT NULLIF(TRIM(csv.name), '')
      ) AS uniqueServices,

      COUNT(DISTINCT csv.ip_entry_id) AS computersWithServices,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.state)) = 'running'
          THEN 1
          ELSE 0
        END
      ) AS running,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.state)) = 'stopped'
          THEN 1
          ELSE 0
        END
      ) AS stopped,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.start_mode)) IN ('auto', 'automatic')
          THEN 1
          ELSE 0
        END
      ) AS automatic,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.start_mode)) = 'manual'
          THEN 1
          ELSE 0
        END
      ) AS manual,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.start_mode)) = 'disabled'
          THEN 1
          ELSE 0
        END
      ) AS disabled,

      SUM(
        CASE
          WHEN LOWER(TRIM(csv.start_mode)) IN ('auto', 'automatic')
           AND LOWER(TRIM(csv.state)) <> 'running'
          THEN 1
          ELSE 0
        END
      ) AS automaticStopped,

      MIN(csv.inventory_date) AS oldestInventoryDate,
      MAX(csv.inventory_date) AS newestInventoryDate

    FROM computer_services csv
    JOIN ip_entries ie ON ie.id = csv.ip_entry_id
    WHERE ie.entry_type = 'computer'
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
      WHERE ip.entry_type = 'computer'
        AND LOWER(TRIM(cs.start_mode)) IN ('auto', 'automatic')
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
      WHERE ip.entry_type = 'computer'
        AND cs.path_name IS NOT NULL
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
      WHERE ip.entry_type = 'computer'
        AND cs.name IS NOT NULL
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
        DISTINCT NULLIF(TRIM(cu.hotfix_id), '')
      ) AS uniqueHotfixes,

      COUNT(DISTINCT cu.ip_entry_id) AS computersWithUpdates,

      SUM(
        CASE
          WHEN cu.installed_on >= CURDATE() - INTERVAL 30 DAY
          THEN 1
          ELSE 0
        END
      ) AS installationsLast30Days,

      MIN(cu.installed_on) AS oldestInstalledOn,
      MAX(cu.installed_on) AS newestInstalledOn,
      MIN(cu.inventory_date) AS oldestInventoryDate,
      MAX(cu.inventory_date) AS newestInventoryDate

    FROM computer_updates cu
    JOIN ip_entries ie ON ie.id = cu.ip_entry_id
    WHERE ie.entry_type = 'computer'
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
        cu.ip_entry_id,
        MAX(cu.installed_on) AS latestUpdate
      FROM computer_updates cu
      JOIN ip_entries ie ON ie.id = cu.ip_entry_id
      WHERE ie.entry_type = 'computer'
        AND cu.installed_on IS NOT NULL
      GROUP BY cu.ip_entry_id
    ) latest
  `);

  const [[missingRow]] = await pool.execute(`
    SELECT COUNT(*) AS withoutData
    FROM ip_entries ip
    WHERE ip.entry_type = 'computer'
      AND NOT EXISTS (
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
        TRIM(cu.hotfix_id) AS hotfixId,
        MAX(cu.description) AS description,
        COUNT(*) AS installations,
        COUNT(DISTINCT cu.ip_entry_id) AS computers,
        MIN(cu.installed_on) AS firstInstalledOn,
        MAX(cu.installed_on) AS lastInstalledOn
      FROM computer_updates cu
      JOIN ip_entries ie ON ie.id = cu.ip_entry_id
      WHERE ie.entry_type = 'computer'
        AND cu.hotfix_id IS NOT NULL
        AND TRIM(cu.hotfix_id) <> ''
      GROUP BY TRIM(cu.hotfix_id)
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

      WHERE ip.entry_type = 'computer'

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
      WHERE ip.entry_type = 'computer'
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

/* =========================================================
   EXPORT (pune liste, bez limita/top-N kurirovanja)
   ========================================================= */

export async function getAllSoftwareForExport() {
  const [rows] = await pool.execute(`
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cs.display_name AS displayName,
      cs.display_version AS displayVersion,
      cs.publisher,
      cs.install_date AS installDate,
      cs.inventory_date AS inventoryDate
    FROM computer_software cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer'
    ORDER BY ie.computer_name ASC, cs.display_name ASC
  `);
  return rows || [];
}

export async function getAllDriversForExport() {
  const [rows] = await pool.execute(`
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cd.device_name AS deviceName,
      cd.driver_version AS driverVersion,
      cd.driver_date AS driverDate,
      cd.manufacturer,
      cd.driver_provider_name AS driverProviderName,
      cd.inventory_date AS inventoryDate
    FROM computer_drivers cd
    JOIN ip_entries ie ON ie.id = cd.ip_entry_id
    WHERE ie.entry_type = 'computer'
    ORDER BY ie.computer_name ASC, cd.device_name ASC
  `);
  return rows || [];
}

export async function getAllServicesForExport() {
  const [rows] = await pool.execute(`
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cs.name,
      cs.display_name AS displayName,
      cs.state,
      cs.start_mode AS startMode,
      cs.start_name AS startName,
      cs.path_name AS pathName,
      cs.inventory_date AS inventoryDate
    FROM computer_services cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer'
    ORDER BY ie.computer_name ASC, cs.display_name ASC
  `);
  return rows || [];
}

export async function getAllUpdatesForExport() {
  const [rows] = await pool.execute(`
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cu.hotfix_id AS hotfixId,
      cu.description,
      cu.installed_on AS installedOn,
      cu.installed_by AS installedBy,
      cu.inventory_date AS inventoryDate
    FROM computer_updates cu
    JOIN ip_entries ie ON ie.id = cu.ip_entry_id
    WHERE ie.entry_type = 'computer'
    ORDER BY ie.computer_name ASC, cu.installed_on DESC
  `);
  return rows || [];
}

/* =========================================================
   SEARCH (prava pretraga cele baze, ne samo kurirane top-N/retke
   tabele koje se prikazuju na dashboard-u)
   ========================================================= */

export async function searchSoftwareRows(term, limit = 100) {
  const { where, params } = buildLikeSearch(
    ["cs.display_name", "cs.display_version", "cs.publisher", "ie.computer_name", "ie.ip"],
    term,
  );
  if (!where) return [];

  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cs.display_name AS displayName,
      cs.display_version AS displayVersion,
      cs.publisher,
      cs.install_date AS installDate,
      cs.inventory_date AS inventoryDate
    FROM computer_software cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer' AND ${where}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows || [];
}

export async function searchDriverRows(term, limit = 100) {
  const { where, params } = buildLikeSearch(
    ["cd.device_name", "cd.driver_version", "cd.manufacturer", "cd.driver_provider_name", "ie.computer_name", "ie.ip"],
    term,
  );
  if (!where) return [];

  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cd.device_name AS deviceName,
      cd.driver_version AS driverVersion,
      cd.driver_date AS driverDate,
      cd.manufacturer,
      cd.driver_provider_name AS driverProviderName,
      cd.inventory_date AS inventoryDate
    FROM computer_drivers cd
    JOIN ip_entries ie ON ie.id = cd.ip_entry_id
    WHERE ie.entry_type = 'computer' AND ${where}
    ORDER BY ie.computer_name ASC, cd.device_name ASC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows || [];
}

export async function searchServiceRows(term, limit = 100) {
  const { where, params } = buildLikeSearch(
    ["cs.name", "cs.display_name", "cs.start_name", "cs.path_name", "ie.computer_name", "ie.ip"],
    term,
  );
  if (!where) return [];

  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cs.name,
      cs.display_name AS displayName,
      cs.state,
      cs.start_mode AS startMode,
      cs.start_name AS startName,
      cs.path_name AS pathName,
      cs.inventory_date AS inventoryDate
    FROM computer_services cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer' AND ${where}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows || [];
}

export async function searchUpdateRows(term, limit = 100) {
  const { where, params } = buildLikeSearch(
    ["cu.hotfix_id", "cu.description", "cu.installed_by", "ie.computer_name", "ie.ip"],
    term,
  );
  if (!where) return [];

  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cu.hotfix_id AS hotfixId,
      cu.description,
      cu.installed_on AS installedOn,
      cu.installed_by AS installedBy,
      cu.inventory_date AS inventoryDate
    FROM computer_updates cu
    JOIN ip_entries ie ON ie.id = cu.ip_entry_id
    WHERE ie.entry_type = 'computer' AND ${where}
    ORDER BY cu.installed_on DESC
    LIMIT ?
    `,
    [...params, limit],
  );
  return rows || [];
}
