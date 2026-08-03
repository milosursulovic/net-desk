import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

/**
 * Zajednička pokrivenost inventarom.
 */
export async function getPdsuCoverage(site) {
  const siteSql = site ? "AND ie.site = ?" : "";
  const siteSqlNoAlias = site ? "AND site = ?" : "";
  const p = site ? [site] : [];

  const [[row]] = await pool.execute(
    `
    SELECT
      (SELECT COUNT(*) FROM ip_entries WHERE entry_type = 'computer' ${siteSqlNoAlias}) AS totalComputers,

      (
        SELECT COUNT(DISTINCT cs.ip_entry_id)
        FROM computer_software cs
        JOIN ip_entries ie ON ie.id = cs.ip_entry_id
        WHERE ie.entry_type = 'computer' ${siteSql}
      ) AS withSoftware,

      (
        SELECT COUNT(DISTINCT cd.ip_entry_id)
        FROM computer_drivers cd
        JOIN ip_entries ie ON ie.id = cd.ip_entry_id
        WHERE ie.entry_type = 'computer' ${siteSql}
      ) AS withDrivers,

      (
        SELECT COUNT(DISTINCT csv.ip_entry_id)
        FROM computer_services csv
        JOIN ip_entries ie ON ie.id = csv.ip_entry_id
        WHERE ie.entry_type = 'computer' ${siteSql}
      ) AS withServices,

      (
        SELECT COUNT(DISTINCT cu.ip_entry_id)
        FROM computer_updates cu
        JOIN ip_entries ie ON ie.id = cu.ip_entry_id
        WHERE ie.entry_type = 'computer' ${siteSql}
      ) AS withUpdates,

      (
        SELECT COUNT(DISTINCT cp.ip_entry_id)
        FROM computer_printers cp
        JOIN ip_entries ie ON ie.id = cp.ip_entry_id
        WHERE ie.entry_type = 'computer' ${siteSql}
      ) AS withPrinters
    `,
    [...p, ...p, ...p, ...p, ...p, ...p],
  );

  return {
    totalComputers: Number(row?.totalComputers) || 0,
    withSoftware: Number(row?.withSoftware) || 0,
    withDrivers: Number(row?.withDrivers) || 0,
    withServices: Number(row?.withServices) || 0,
    withUpdates: Number(row?.withUpdates) || 0,
    withPrinters: Number(row?.withPrinters) || 0,
  };
}

// "Bez PDSU" = nema baš nijedan zapis ni u jednoj od 5 tabela (stroži
// kriterijum od "nedostaje bar jedna kategorija") - videti getPdsuCoverage
// za per-tabelu brojeve.
export async function listComputersWithoutPdsu(site) {
  const [rows] = await pool.execute(
    `
    SELECT ip.id, ip.ip, ip.computer_name AS computerName, ip.department, ip.os
    FROM ip_entries ip
    WHERE ip.entry_type = 'computer'
      ${site ? "AND ip.site = ?" : ""}
      AND NOT EXISTS (SELECT 1 FROM computer_software cs WHERE cs.ip_entry_id = ip.id)
      AND NOT EXISTS (SELECT 1 FROM computer_drivers cd WHERE cd.ip_entry_id = ip.id)
      AND NOT EXISTS (SELECT 1 FROM computer_services csv WHERE csv.ip_entry_id = ip.id)
      AND NOT EXISTS (SELECT 1 FROM computer_updates cu WHERE cu.ip_entry_id = ip.id)
      AND NOT EXISTS (SELECT 1 FROM computer_printers cp WHERE cp.ip_entry_id = ip.id)
    ORDER BY ip.computer_name ASC, ip.ip ASC
    `,
    site ? [site] : [],
  );
  return rows || [];
}

// "Bez UltraVNC" = nema nijedan servis u servis-inventaru čiji naziv liči na
// UltraVNC (uvnc_service je stvarni naziv servisa koji registruje
// Deploy-NetdeskVnc.ps1, winvnc/ultravnc su dodatni obrasci za starije/ručne
// instalacije) - koristi se da se pronađu računari na kojima deploy skriptu
// treba (ponovo) pokrenuti. hasServiceData razlikuje "potvrđeno nema
// UltraVNC" od "nemamo uopšte servis-inventar za ovaj računar" (agent
// možda nikad nije sinhronizovao servise), pošto oba slučaja padaju u isti
// NOT EXISTS.
export async function listComputersWithoutUltravnc(site) {
  const [rows] = await pool.execute(
    `
    SELECT
      ip.id, ip.ip, ip.computer_name AS computerName, ip.department, ip.os,
      ip.is_online AS isOnline,
      agents.id AS agentId,
      EXISTS(
        SELECT 1 FROM computer_services csv2 WHERE csv2.ip_entry_id = ip.id
      ) AS hasServiceData
    FROM ip_entries ip
    LEFT JOIN agents ON agents.ip_entry_id = ip.id AND agents.status = 'active'
    WHERE ip.entry_type = 'computer'
      ${site ? "AND ip.site = ?" : ""}
      AND NOT EXISTS (
        SELECT 1 FROM computer_services csv
        WHERE csv.ip_entry_id = ip.id
          AND (
            LOWER(csv.name) LIKE '%uvnc%'
            OR LOWER(csv.name) LIKE '%ultravnc%'
            OR LOWER(csv.name) LIKE '%winvnc%'
          )
      )
    ORDER BY ip.computer_name ASC, ip.ip ASC
    `,
    site ? [site] : [],
  );
  return rows || [];
}

/* =========================================================
   SOFTWARE
   ========================================================= */

export async function getSoftwareStats(site) {
  const [[row]] = await pool.execute(
    `
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );

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

export async function getTopSoftware(limit = 10, site) {
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
        ${site ? "AND ie.site = ?" : ""}
        AND cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
      GROUP BY TRIM(cs.display_name)
      ORDER BY computers DESC, installations DESC, name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    name: row.name,
    installations: Number(row.installations) || 0,
    computers: Number(row.computers) || 0,
    versions: Number(row.versions) || 0,
  }));
}

export async function getTopPublishers(limit = 10, site) {
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
      WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
      GROUP BY
        COALESCE(
          NULLIF(TRIM(cs.publisher), ''),
          'Nepoznat izdavač'
        )
      ORDER BY installations DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    publisher: row.publisher,
    installations: Number(row.installations) || 0,
    computers: Number(row.computers) || 0,
    softwareCount: Number(row.softwareCount) || 0,
  }));
}

export async function getSoftwareMultipleVersions(limit = 20, site) {
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
        ${site ? "AND ie.site = ?" : ""}
        AND cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
        AND cs.display_version IS NOT NULL
        AND TRIM(cs.display_version) <> ''
      GROUP BY TRIM(cs.display_name)
      HAVING COUNT(DISTINCT cs.display_version) > 1
      ORDER BY versionCount DESC, computers DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    name: row.name,
    versionCount: Number(row.versionCount) || 0,
    computers: Number(row.computers) || 0,
    versions: row.versions ?? "",
  }));
}

export async function getRareSoftware(limit = 20, site) {
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
        ${site ? "AND ip.site = ?" : ""}
        AND cs.display_name IS NOT NULL
        AND TRIM(cs.display_name) <> ''
      GROUP BY TRIM(cs.display_name)
      HAVING COUNT(DISTINCT cs.ip_entry_id) <= 2
      ORDER BY computers ASC, name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    name: row.name,
    version: row.version ?? null,
    publisher: row.publisher ?? null,
    computers: Number(row.computers) || 0,
    computerNames: row.computerNames ?? "",
  }));
}

export async function getComputersWithMostSoftware(limit = 10, site) {
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
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department
      ORDER BY softwareCount DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getDriverStats(site) {
  const [[row]] = await pool.execute(
    `
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );

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

export async function getTopDriverManufacturers(limit = 10, site) {
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
      WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
      GROUP BY
        COALESCE(
          NULLIF(TRIM(cd.manufacturer), ''),
          NULLIF(TRIM(cd.driver_provider_name), ''),
          'Nepoznat proizvođač'
        )
      ORDER BY drivers DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    manufacturer: row.manufacturer,
    drivers: Number(row.drivers) || 0,
    computers: Number(row.computers) || 0,
    devices: Number(row.devices) || 0,
  }));
}

export async function getOldestDrivers(limit = 20, site) {
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
        ${site ? "AND ip.site = ?" : ""}
        AND cd.driver_date IS NOT NULL
      ORDER BY cd.driver_date ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getDriverMultipleVersions(limit = 20, site) {
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
        ${site ? "AND ie.site = ?" : ""}
        AND cd.device_name IS NOT NULL
        AND TRIM(cd.device_name) <> ''
        AND cd.driver_version IS NOT NULL
        AND TRIM(cd.driver_version) <> ''
      GROUP BY TRIM(cd.device_name)
      HAVING COUNT(DISTINCT cd.driver_version) > 1
      ORDER BY versionCount DESC, computers DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    deviceName: row.deviceName,
    manufacturer: row.manufacturer ?? null,
    versionCount: Number(row.versionCount) || 0,
    computers: Number(row.computers) || 0,
    versions: row.versions ?? "",
  }));
}

export async function getComputersWithMostDrivers(limit = 10, site) {
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
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
      GROUP BY
        ip.id,
        ip.ip,
        ip.computer_name,
        ip.department
      ORDER BY driverCount DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getServiceStats(site) {
  const [[row]] = await pool.execute(
    `
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );

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

export async function getAutomaticStoppedServices(limit = 30, site) {
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
        ${site ? "AND ip.site = ?" : ""}
        AND LOWER(TRIM(cs.start_mode)) IN ('auto', 'automatic')
        AND LOWER(TRIM(cs.state)) <> 'running'
      ORDER BY
        ip.computer_name ASC,
        cs.display_name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getUnusualServicePaths(limit = 30, site) {
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
        ${site ? "AND ip.site = ?" : ""}
        AND cs.path_name IS NOT NULL
        AND TRIM(cs.path_name) <> ''

        -- Double-escaped on purpose: the JS template literal needs \\ to
        -- produce one literal backslash, and MySQL's LIKE needs \\ to match
        -- one literal backslash (its default escape char) - so four
        -- backslashes here become a single '\' in the path being matched.
        AND LOWER(cs.path_name) NOT LIKE '%\\\\windows\\\\%'
        AND LOWER(cs.path_name) NOT LIKE '%\\\\program files\\\\%'
        AND LOWER(cs.path_name) NOT LIKE '%\\\\program files (x86)\\\\%'

      ORDER BY ip.computer_name ASC, cs.name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getRareServices(limit = 20, site) {
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
        ${site ? "AND ip.site = ?" : ""}
        AND cs.name IS NOT NULL
        AND TRIM(cs.name) <> ''
      GROUP BY TRIM(cs.name)
      HAVING COUNT(DISTINCT cs.ip_entry_id) <= 2
      ORDER BY computers ASC, name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getUpdateStats(site) {
  const [[row]] = await pool.execute(
    `
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
      ${site ? "AND ie.site = ?" : ""}
  `,
    site ? [site] : [],
  );

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

export async function getUpdateFreshnessBuckets(site) {
  const [[row]] = await pool.execute(
    `
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
        ${site ? "AND ie.site = ?" : ""}
        AND cu.installed_on IS NOT NULL
      GROUP BY cu.ip_entry_id
    ) latest
  `,
    site ? [site] : [],
  );

  const [[missingRow]] = await pool.execute(
    `
    SELECT COUNT(*) AS withoutData
    FROM ip_entries ip
    WHERE ip.entry_type = 'computer'
      ${site ? "AND ip.site = ?" : ""}
      AND NOT EXISTS (
        SELECT 1
        FROM computer_updates cu
        WHERE cu.ip_entry_id = ip.id
      )
  `,
    site ? [site] : [],
  );

  return {
    last30Days: Number(row?.last30Days) || 0,
    days31To60: Number(row?.days31To60) || 0,
    days61To90: Number(row?.days61To90) || 0,
    olderThan90Days: Number(row?.olderThan90Days) || 0,
    withoutData: Number(missingRow?.withoutData) || 0,
  };
}

export async function getTopHotfixes(limit = 10, site) {
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
        ${site ? "AND ie.site = ?" : ""}
        AND cu.hotfix_id IS NOT NULL
        AND TRIM(cu.hotfix_id) <> ''
      GROUP BY TRIM(cu.hotfix_id)
      ORDER BY computers DESC, installations DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
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

export async function getLatestUpdateByComputer(limit = 200, site) {
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
        ${site ? "AND ip.site = ?" : ""}

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
    [...(site ? [site] : []), limit],
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

export async function getStaleUpdateComputers(staleDays = 90, limit = 50, site) {
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
        ${site ? "AND ip.site = ?" : ""}
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
    [...(site ? [site] : []), safeDays, limit],
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
   PRINTERS
   ========================================================= */

export async function getPrinterStats(site) {
  const [[row]] = await pool.execute(
    `
    SELECT
      COUNT(*) AS totalPrinters,

      COUNT(
        DISTINCT NULLIF(TRIM(cp.name), '')
      ) AS uniquePrinters,

      COUNT(DISTINCT cp.ip_entry_id) AS computersWithPrinters,

      SUM(
        CASE WHEN cp.is_default = 1 THEN 1 ELSE 0 END
      ) AS defaultCount,

      -- "Zdrav" status pretpostavljen kao OK/Idle/Unknown (Win32_Printer.Status
      -- vrednosti) - sve ostalo (Error, Offline, Paused, Degraded...) se broji
      -- kao problem. Prazan/NULL status se NE broji kao problem (nepoznato
      -- stanje agenta u trenutku upita, ne potvrđen problem).
      SUM(
        CASE
          WHEN cp.status IS NOT NULL AND TRIM(cp.status) <> ''
           AND LOWER(TRIM(cp.status)) NOT IN ('ok', 'idle', 'unknown')
          THEN 1
          ELSE 0
        END
      ) AS problemStatus,

      MIN(cp.inventory_date) AS oldestInventoryDate,
      MAX(cp.inventory_date) AS newestInventoryDate

    FROM computer_printers cp
    JOIN ip_entries ie ON ie.id = cp.ip_entry_id
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );

  const totalPrinters = Number(row?.totalPrinters) || 0;
  const computersWithPrinters = Number(row?.computersWithPrinters) || 0;

  return {
    totalPrinters,
    uniquePrinters: Number(row?.uniquePrinters) || 0,
    computersWithPrinters,
    avgPerComputer: computersWithPrinters
      ? Math.round((totalPrinters / computersWithPrinters) * 10) / 10
      : 0,
    defaultCount: Number(row?.defaultCount) || 0,
    problemStatus: Number(row?.problemStatus) || 0,
    oldestInventoryDate: row?.oldestInventoryDate ?? null,
    newestInventoryDate: row?.newestInventoryDate ?? null,
  };
}

export async function getTopPrinterNames(limit = 10, site) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(cp.name) AS name,
        COUNT(DISTINCT cp.ip_entry_id) AS computers
      FROM computer_printers cp
      JOIN ip_entries ip ON ip.id = cp.ip_entry_id
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
        AND cp.name IS NOT NULL AND TRIM(cp.name) <> ''
      GROUP BY TRIM(cp.name)
      ORDER BY computers DESC, name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({ name: row.name, computers: Number(row.computers) || 0 }));
}

export async function getTopPrinterDrivers(limit = 10, site) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(cp.driver_name) AS driverName,
        COUNT(*) AS printers,
        COUNT(DISTINCT cp.ip_entry_id) AS computers
      FROM computer_printers cp
      JOIN ip_entries ip ON ip.id = cp.ip_entry_id
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
        AND cp.driver_name IS NOT NULL AND TRIM(cp.driver_name) <> ''
      GROUP BY TRIM(cp.driver_name)
      ORDER BY printers DESC, driverName ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    driverName: row.driverName,
    printers: Number(row.printers) || 0,
    computers: Number(row.computers) || 0,
  }));
}

export async function getPrintersWithProblemStatus(limit = 30, site) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        cp.name,
        cp.driver_name AS driverName,
        cp.port_name AS portName,
        cp.status,
        cp.is_default AS isDefault,
        cp.inventory_date AS inventoryDate
      FROM computer_printers cp
      JOIN ip_entries ip ON ip.id = cp.ip_entry_id
      WHERE ip.entry_type = 'computer'
        ${site ? "AND ip.site = ?" : ""}
        AND cp.status IS NOT NULL AND TRIM(cp.status) <> ''
        AND LOWER(TRIM(cp.status)) NOT IN ('ok', 'idle', 'unknown')
      ORDER BY ip.computer_name ASC, cp.name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    name: row.name,
    driverName: row.driverName,
    portName: row.portName,
    status: row.status,
    isDefault: Boolean(row.isDefault),
    inventoryDate: row.inventoryDate,
  }));
}

export async function getRarePrinters(limit = 20, site) {
  const [rows] = await pool.execute(
    `
      SELECT
        TRIM(cp.name) AS name,
        COUNT(DISTINCT cp.ip_entry_id) AS computers,
        GROUP_CONCAT(
          DISTINCT COALESCE(NULLIF(TRIM(ip.computer_name), ''), ip.ip)
          ORDER BY ip.computer_name
          SEPARATOR ', '
        ) AS computerNames
      FROM computer_printers cp
      JOIN ip_entries ip ON ip.id = cp.ip_entry_id
      WHERE ip.entry_type = 'computer'
        ${site ? "AND ip.site = ?" : ""}
        AND cp.name IS NOT NULL AND TRIM(cp.name) <> ''
      GROUP BY TRIM(cp.name)
      HAVING COUNT(DISTINCT cp.ip_entry_id) <= 2
      ORDER BY computers ASC, name ASC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    name: row.name,
    computers: Number(row.computers) || 0,
    computerNames: row.computerNames ?? "",
  }));
}

export async function getComputersWithMostPrinters(limit = 10, site) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        COUNT(cp.id) AS printerCount,
        MAX(cp.inventory_date) AS inventoryDate
      FROM ip_entries ip
      JOIN computer_printers cp ON cp.ip_entry_id = ip.id
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
      GROUP BY ip.id, ip.ip, ip.computer_name, ip.department
      ORDER BY printerCount DESC
      LIMIT ?
    `,
    [...(site ? [site] : []), limit],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    printerCount: Number(row.printerCount) || 0,
    inventoryDate: row.inventoryDate,
  }));
}

// Štampači po računaru za "aktivni štampač" izveštaj. Win32_Printer.Default
// (WMI) je jedini realan signal koji Windows daje za "trenutno se koristi" -
// nema "poslednji put korišćen" podatak - ali dosta mašina nema NIJEDAN
// štampač markiran kao default, ili je default ispao neki softverski/
// virtuelni štampač (Print to PDF, AnyDesk...). Zato ovo namerno vraća SVE
// sinhronizovane štampače po računaru (ne samo default), da nijedan računar
// ne ispadne iz izveštaja - isDefault na svakom redu govori da li je taj
// konkretan štampač Windows-ov podrazumevani.
export async function getActivePrinterPerComputer(site) {
  const [rows] = await pool.execute(
    `
      SELECT
        ip.id AS ipEntryId,
        ip.ip,
        ip.computer_name AS computerName,
        ip.department,
        cp.name,
        cp.driver_name AS driverName,
        cp.port_name AS portName,
        cp.status,
        cp.is_default AS isDefault,
        cp.inventory_date AS inventoryDate
      FROM ip_entries ip
      JOIN computer_printers cp ON cp.ip_entry_id = ip.id
      WHERE ip.entry_type = 'computer' ${site ? "AND ip.site = ?" : ""}
      ORDER BY ip.computer_name ASC, ip.ip ASC, cp.is_default DESC, cp.name ASC
    `,
    site ? [site] : [],
  );

  return rows.map((row) => ({
    ipEntryId: Number(row.ipEntryId),
    ip: row.ip,
    computerName: row.computerName,
    department: row.department,
    name: row.name,
    driverName: row.driverName,
    portName: row.portName,
    status: row.status,
    isDefault: Boolean(row.isDefault),
    inventoryDate: row.inventoryDate,
  }));
}

/* =========================================================
   EXPORT (pune liste, bez limita/top-N kurirovanja)
   ========================================================= */

export async function getAllSoftwareForExport(site) {
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
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
  `,
    site ? [site] : [],
  );
  return rows || [];
}

export async function getAllDriversForExport(site) {
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
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY ie.computer_name ASC, cd.device_name ASC
  `,
    site ? [site] : [],
  );
  return rows || [];
}

export async function getAllServicesForExport(site) {
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
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
  `,
    site ? [site] : [],
  );
  return rows || [];
}

export async function getAllUpdatesForExport(site) {
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
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY ie.computer_name ASC, cu.installed_on DESC
  `,
    site ? [site] : [],
  );
  return rows || [];
}

export async function getAllPrintersForExport(site) {
  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cp.name,
      cp.driver_name AS driverName,
      cp.port_name AS portName,
      cp.status,
      cp.is_default AS isDefault,
      cp.inventory_date AS inventoryDate
    FROM computer_printers cp
    JOIN ip_entries ie ON ie.id = cp.ip_entry_id
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY ie.computer_name ASC, cp.name ASC
  `,
    site ? [site] : [],
  );
  return rows || [];
}

/* =========================================================
   SEARCH (prava pretraga cele baze, ne samo kurirane top-N/retke
   tabele koje se prikazuju na dashboard-u)
   ========================================================= */

export async function searchSoftwareRows(term, limit = 100, site) {
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""} AND ${where}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
    LIMIT ?
    `,
    [...(site ? [site] : []), ...params, limit],
  );
  return rows || [];
}

export async function searchDriverRows(term, limit = 100, site) {
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""} AND ${where}
    ORDER BY ie.computer_name ASC, cd.device_name ASC
    LIMIT ?
    `,
    [...(site ? [site] : []), ...params, limit],
  );
  return rows || [];
}

export async function searchServiceRows(term, limit = 100, site) {
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""} AND ${where}
    ORDER BY ie.computer_name ASC, cs.display_name ASC
    LIMIT ?
    `,
    [...(site ? [site] : []), ...params, limit],
  );
  return rows || [];
}

export async function searchUpdateRows(term, limit = 100, site) {
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
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""} AND ${where}
    ORDER BY cu.installed_on DESC
    LIMIT ?
    `,
    [...(site ? [site] : []), ...params, limit],
  );
  return rows || [];
}

export async function searchPrinterRows(term, limit = 100, site) {
  const { where, params } = buildLikeSearch(
    ["cp.name", "cp.driver_name", "cp.port_name", "ie.computer_name", "ie.ip"],
    term,
  );
  if (!where) return [];

  const [rows] = await pool.execute(
    `
    SELECT
      ie.computer_name AS computerName,
      ie.ip,
      ie.department,
      cp.name,
      cp.driver_name AS driverName,
      cp.port_name AS portName,
      cp.status,
      cp.is_default AS isDefault,
      cp.inventory_date AS inventoryDate
    FROM computer_printers cp
    JOIN ip_entries ie ON ie.id = cp.ip_entry_id
    WHERE ie.entry_type = 'computer' ${site ? "AND ie.site = ?" : ""} AND ${where}
    ORDER BY ie.computer_name ASC, cp.name ASC
    LIMIT ?
    `,
    [...(site ? [site] : []), ...params, limit],
  );
  return rows || [];
}
