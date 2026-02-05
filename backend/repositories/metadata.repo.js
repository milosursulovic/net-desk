import { pool } from "../db/pool.js";

export async function loadMetadataBaseById(metadataId) {
  const [[meta]] = await pool.execute(
    `
    SELECT
      id,
      ip_entry_id AS ipEntryId,
      collected_at AS CollectedAt,
      computer_name AS ComputerName,
      user_name AS UserName,

      os_caption AS osCaption,
      os_version AS osVersion,
      os_build AS osBuild,
      os_install_date AS osInstallDate,

      system_manufacturer AS systemManufacturer,
      system_model AS systemModel,
      system_total_ram_gb AS systemTotalRamGb,

      mb_manufacturer AS mbManufacturer,
      mb_product AS mbProduct,
      mb_serial AS mbSerial,

      bios_vendor AS biosVendor,
      bios_version AS biosVersion,
      bios_release_date AS biosReleaseDate,

      cpu_name AS cpuName,
      cpu_cores AS cpuCores,
      cpu_logical_cpus AS cpuLogicalCpus,
      cpu_max_clock_mhz AS cpuMaxClockMHz,
      cpu_socket AS cpuSocket,

      psu AS PSU,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM computer_metadata
    WHERE id = ?
    LIMIT 1
    `,
    [metadataId],
  );
  return meta || null;
}

export async function loadMetadataChildren(metadataId) {
  const [ram] = await pool.execute(
    `SELECT slot AS Slot, manufacturer AS Manufacturer, part_number AS PartNumber, serial AS Serial,
            capacity_gb AS CapacityGB, speed_mtps AS SpeedMTps, form_factor AS FormFactor
     FROM computer_metadata_ram_modules WHERE metadata_id = ?`,
    [metadataId],
  );

  const [storage] = await pool.execute(
    `SELECT model AS Model, serial AS Serial, firmware AS Firmware, size_gb AS SizeGB, media_type AS MediaType,
            bus_type AS BusType, device_id AS DeviceID
     FROM computer_metadata_storage WHERE metadata_id = ?`,
    [metadataId],
  );

  const [gpus] = await pool.execute(
    `SELECT name AS Name, driver_vers AS DriverVers, vram_gb AS VRAM_GB
     FROM computer_metadata_gpus WHERE metadata_id = ?`,
    [metadataId],
  );

  const [nics] = await pool.execute(
    `SELECT name AS Name, mac AS MAC, speed_mbps AS SpeedMbps
     FROM computer_metadata_nics WHERE metadata_id = ?`,
    [metadataId],
  );

  return {
    ram: ram || [],
    storage: storage || [],
    gpus: gpus || [],
    nics: nics || [],
  };
}

export async function findMetadataIdByIpEntryId(ipEntryId) {
  const [[row]] = await pool.execute(
    `SELECT id FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
    [ipEntryId],
  );
  return row?.id ?? null;
}

export async function listMetadataIds(offset, limit) {
  const [rows] = await pool.execute(
    `SELECT id FROM computer_metadata ORDER BY id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return rows || [];
}

export async function countMetadataTotal() {
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM computer_metadata`,
  );
  return Number(total) || 0;
}

export async function beginTx() {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  return conn;
}

export async function commitTx(conn) {
  await conn.commit();
  conn.release();
}

export async function rollbackTx(conn) {
  try {
    await conn.rollback();
  } catch {}
  conn.release();
}

export async function txGetExistingMetaId(conn, ipEntryId) {
  const [[existing]] = await conn.execute(
    `SELECT id FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
    [ipEntryId],
  );
  return existing?.id ?? null;
}

export async function txInsertMeta(conn, ipEntryId, data) {
  const [ins] = await conn.execute(
    `
    INSERT INTO computer_metadata
      (ip_entry_id, collected_at, computer_name, user_name,
       os_caption, os_version, os_build, os_install_date,
       system_manufacturer, system_model, system_total_ram_gb,
       mb_manufacturer, mb_product, mb_serial,
       bios_vendor, bios_version, bios_release_date,
       cpu_name, cpu_cores, cpu_logical_cpus, cpu_max_clock_mhz, cpu_socket,
       psu)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      ipEntryId,
      data.collectedAt,
      data.computerName,
      data.userName,

      data.osCaption,
      data.osVersion,
      data.osBuild,
      data.osInstallDate,

      data.systemManufacturer,
      data.systemModel,
      data.systemTotalRamGb,

      data.mbManufacturer,
      data.mbProduct,
      data.mbSerial,

      data.biosVendor,
      data.biosVersion,
      data.biosReleaseDate,

      data.cpuName,
      data.cpuCores,
      data.cpuLogical,
      data.cpuMaxClock,
      data.cpuSocket,

      data.psu,
    ],
  );
  return ins.insertId;
}

export async function txUpdateMeta(conn, metadataId, data) {
  await conn.execute(
    `
    UPDATE computer_metadata SET
      collected_at = ?,
      computer_name = ?,
      user_name = ?,

      os_caption = ?,
      os_version = ?,
      os_build = ?,
      os_install_date = ?,

      system_manufacturer = ?,
      system_model = ?,
      system_total_ram_gb = ?,

      mb_manufacturer = ?,
      mb_product = ?,
      mb_serial = ?,

      bios_vendor = ?,
      bios_version = ?,
      bios_release_date = ?,

      cpu_name = ?,
      cpu_cores = ?,
      cpu_logical_cpus = ?,
      cpu_max_clock_mhz = ?,
      cpu_socket = ?,

      psu = ?
    WHERE id = ?
    `,
    [
      data.collectedAt,
      data.computerName,
      data.userName,

      data.osCaption,
      data.osVersion,
      data.osBuild,
      data.osInstallDate,

      data.systemManufacturer,
      data.systemModel,
      data.systemTotalRamGb,

      data.mbManufacturer,
      data.mbProduct,
      data.mbSerial,

      data.biosVendor,
      data.biosVersion,
      data.biosReleaseDate,

      data.cpuName,
      data.cpuCores,
      data.cpuLogical,
      data.cpuMaxClock,
      data.cpuSocket,

      data.psu,
      metadataId,
    ],
  );
}

export async function txAttachMetadataToIpEntry(conn, ipEntryId, metadataId) {
  await conn.execute(`UPDATE ip_entries SET metadata_id = ? WHERE id = ?`, [
    metadataId,
    ipEntryId,
  ]);
}

export async function txReplaceRam(conn, metadataId, modules) {
  await conn.execute(
    `DELETE FROM computer_metadata_ram_modules WHERE metadata_id = ?`,
    [metadataId],
  );
  for (const m of modules) {
    await conn.execute(
      `
      INSERT INTO computer_metadata_ram_modules
        (metadata_id, slot, manufacturer, part_number, serial, capacity_gb, speed_mtps, form_factor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        metadataId,
        m.slot,
        m.manufacturer,
        m.partNumber,
        m.serial,
        m.capacityGb,
        m.speedMtps,
        m.formFactor,
      ],
    );
  }
}

export async function txReplaceStorage(conn, metadataId, items) {
  await conn.execute(
    `DELETE FROM computer_metadata_storage WHERE metadata_id = ?`,
    [metadataId],
  );
  for (const s of items) {
    await conn.execute(
      `
      INSERT INTO computer_metadata_storage
        (metadata_id, model, serial, firmware, size_gb, media_type, bus_type, device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        metadataId,
        s.model,
        s.serial,
        s.firmware,
        s.sizeGb,
        s.mediaType,
        s.busType,
        s.deviceId,
      ],
    );
  }
}

export async function txReplaceGpus(conn, metadataId, items) {
  await conn.execute(
    `DELETE FROM computer_metadata_gpus WHERE metadata_id = ?`,
    [metadataId],
  );
  for (const g of items) {
    await conn.execute(
      `INSERT INTO computer_metadata_gpus (metadata_id, name, driver_vers, vram_gb) VALUES (?, ?, ?, ?)`,
      [metadataId, g.name, g.driverVers, g.vramGb],
    );
  }
}

export async function txReplaceNics(conn, metadataId, items) {
  await conn.execute(
    `DELETE FROM computer_metadata_nics WHERE metadata_id = ?`,
    [metadataId],
  );
  for (const n of items) {
    await conn.execute(
      `INSERT INTO computer_metadata_nics (metadata_id, name, mac, speed_mbps) VALUES (?, ?, ?, ?)`,
      [metadataId, n.name, n.mac, n.speedMbps],
    );
  }
}

export async function statsTotalIpEntries() {
  const [[{ totalIpEntries }]] = await pool.execute(
    `SELECT COUNT(*) AS totalIpEntries FROM ip_entries`,
  );
  return Number(totalIpEntries) || 0;
}

export async function statsTotalWithMeta() {
  const [[{ totalWithMeta }]] = await pool.execute(
    `SELECT COUNT(*) AS totalWithMeta FROM computer_metadata`,
  );
  return Number(totalWithMeta) || 0;
}

export async function statsRamTotals() {
  const [rows] = await pool.execute(
    `
    SELECT
      cm.id,
      COALESCE(
        cm.system_total_ram_gb,
        (
          SELECT COALESCE(SUM(rm.capacity_gb), 0)
          FROM computer_metadata_ram_modules rm
          WHERE rm.metadata_id = cm.id
        )
      ) AS ramTotal
    FROM computer_metadata cm
    `,
  );
  return rows || [];
}

export async function statsStorageAgg() {
  const [rows] = await pool.execute(
    `
    SELECT
      SUM(COALESCE(s.size_gb, 0)) AS totalGb,
      SUM(CASE WHEN UPPER(COALESCE(s.media_type,'')) LIKE '%SSD%' THEN 1 ELSE 0 END) AS ssdCount,
      SUM(CASE WHEN UPPER(COALESCE(s.media_type,'')) LIKE '%HDD%' THEN 1 ELSE 0 END) AS hddCount
    FROM computer_metadata_storage s
    `,
  );
  return rows?.[0] || { totalGb: 0, ssdCount: 0, hddCount: 0 };
}

export async function statsGpuCounts() {
  const [[{ withGpu }]] = await pool.execute(
    `SELECT COUNT(DISTINCT metadata_id) AS withGpu FROM computer_metadata_gpus`,
  );
  const [[{ avgVramGb }]] = await pool.execute(
    `SELECT AVG(COALESCE(vram_gb, 0)) AS avgVramGb FROM computer_metadata_gpus`,
  );
  return { withGpu: Number(withGpu) || 0, avgVramGb: Number(avgVramGb) || 0 };
}

export async function statsTopOs() {
  const [rows] = await pool.execute(
    `
    SELECT
      TRIM(CONCAT(COALESCE(os_caption,''), ' ', COALESCE(os_version,''))) AS \`key\`,
      COUNT(*) AS count
    FROM computer_metadata
    GROUP BY \`key\`
    ORDER BY count DESC
    LIMIT 5
    `,
  );
  return rows || [];
}

export async function statsTopManufacturers() {
  const [rows] = await pool.execute(
    `
    SELECT
      COALESCE(NULLIF(system_manufacturer,''), NULLIF(mb_manufacturer,''), NULL) AS \`key\`,
      COUNT(*) AS count
    FROM computer_metadata
    GROUP BY \`key\`
    ORDER BY count DESC
    LIMIT 6
    `,
  );
  return rows || [];
}

export async function statsTopNicSpeedsRaw() {
  const [rows] = await pool.execute(
    `
    SELECT
      CASE
        WHEN COALESCE(speed_mbps,0) >= 950 AND COALESCE(speed_mbps,0) <= 1100 THEN 1000
        ELSE COALESCE(speed_mbps,0)
      END AS speedNorm,
      COUNT(*) AS count
    FROM computer_metadata_nics
    GROUP BY speedNorm
    ORDER BY count DESC
    LIMIT 5
    `,
  );
  return rows || [];
}

export async function statsRecencyAgg(startDate) {
  const [rows] = await pool.execute(
    `
    SELECT DATE(collected_at) AS day, COUNT(*) AS count
    FROM computer_metadata
    WHERE collected_at >= ?
    GROUP BY DATE(collected_at)
    ORDER BY day ASC
    `,
    [startDate],
  );
  return rows || [];
}

export async function statsLowRamRows() {
  const [rows] = await pool.execute(
    `
    SELECT
      COALESCE(cm.computer_name, '—') AS ComputerName,
      cm.os_caption AS osCaption,
      cm.collected_at AS CollectedAt,
      COALESCE(
        cm.system_total_ram_gb,
        (
          SELECT COALESCE(SUM(rm.capacity_gb), 0)
          FROM computer_metadata_ram_modules rm
          WHERE rm.metadata_id = cm.id
        )
      ) AS TotalRAM_GB
    FROM computer_metadata cm
    ORDER BY TotalRAM_GB ASC
    LIMIT 10
    `,
  );
  return rows || [];
}

export async function statsOldOsRows() {
  const [rows] = await pool.execute(
    `
    SELECT
      COALESCE(computer_name, '—') AS ComputerName,
      os_caption AS osCaption,
      os_install_date AS osInstallDate,
      collected_at AS CollectedAt
    FROM computer_metadata
    WHERE os_install_date IS NOT NULL
    ORDER BY os_install_date ASC
    LIMIT 10
    `,
  );
  return rows || [];
}

export async function statsLexarFlagRows() {
  const [rows] = await pool.execute(
    `
    SELECT
      COALESCE(cm.computer_name, '—') AS ComputerName,
      s.model AS Model,
      s.serial AS Serial,
      COALESCE(s.size_gb, 0) AS SizeGB,
      s.media_type AS MediaType,
      cm.collected_at AS CollectedAt
    FROM computer_metadata_storage s
    JOIN computer_metadata cm ON cm.id = s.metadata_id
    WHERE s.model LIKE '%lexar%' AND UPPER(COALESCE(s.media_type,'')) LIKE '%SSD%'
    ORDER BY ComputerName ASC
    `,
  );
  return rows || [];
}
