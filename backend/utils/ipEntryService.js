import { pool } from "../index.js";

function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255,
  );
}

function ipToNumeric(ip) {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4: ${ip}`);
  return (
    ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

function asDateOrNull(v) {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function asStr(v) {
  if (v == null) return null;
  const s = String(v);
  return s.trim() === "" ? null : s;
}
function asNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick(obj, path, def = null) {
  if (!obj || typeof obj !== "object") return def;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return def;
    cur = cur[p];
  }
  return cur == null ? def : cur;
}

async function getIpEntryById(conn, id) {
  const [[row]] = await conn.execute(
    `
    SELECT
      id,
      ip,
      ip_numeric AS ipNumeric,
      computer_name AS computerName,
      username,
      full_name AS fullName,
      password,
      rdp,
      dns_log AS dnsLog,
      anydesk,
      system,
      department,
      metadata_id AS metadataId,
      is_online AS isOnline,
      last_checked AS lastChecked,
      last_status_change AS lastStatusChange,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM ip_entries
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return row || null;
}

async function getMetadataByIpEntryId(conn, ipEntryId) {
  const [[meta]] = await conn.execute(
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
    WHERE ip_entry_id = ?
    LIMIT 1
    `,
    [ipEntryId],
  );

  if (!meta) return null;

  const [ram] = await conn.execute(
    `SELECT
        slot AS Slot,
        manufacturer AS Manufacturer,
        part_number AS PartNumber,
        serial AS Serial,
        capacity_gb AS CapacityGB,
        speed_mtps AS SpeedMTps,
        form_factor AS FormFactor
     FROM computer_metadata_ram_modules
     WHERE metadata_id = ?`,
    [meta.id],
  );

  const [storage] = await conn.execute(
    `SELECT
        model AS Model,
        serial AS Serial,
        firmware AS Firmware,
        size_gb AS SizeGB,
        media_type AS MediaType,
        bus_type AS BusType,
        device_id AS DeviceID
     FROM computer_metadata_storage
     WHERE metadata_id = ?`,
    [meta.id],
  );

  const [gpus] = await conn.execute(
    `SELECT
        name AS Name,
        driver_vers AS DriverVers,
        vram_gb AS VRAM_GB
     FROM computer_metadata_gpus
     WHERE metadata_id = ?`,
    [meta.id],
  );

  const [nics] = await conn.execute(
    `SELECT
        name AS Name,
        mac AS MAC,
        speed_mbps AS SpeedMbps
     FROM computer_metadata_nics
     WHERE metadata_id = ?`,
    [meta.id],
  );

  return {
    _sqlId: meta.id,
    ipEntry: meta.ipEntryId,
    CollectedAt: meta.CollectedAt ?? null,
    ComputerName: meta.ComputerName ?? null,
    UserName: meta.UserName ?? null,

    OS: {
      Caption: meta.osCaption ?? null,
      Version: meta.osVersion ?? null,
      Build: meta.osBuild ?? null,
      InstallDate: meta.osInstallDate ?? null,
    },
    System: {
      Manufacturer: meta.systemManufacturer ?? null,
      Model: meta.systemModel ?? null,
      TotalRAM_GB: meta.systemTotalRamGb ?? null,
    },
    Motherboard: {
      Manufacturer: meta.mbManufacturer ?? null,
      Product: meta.mbProduct ?? null,
      Serial: meta.mbSerial ?? null,
    },
    BIOS: {
      Vendor: meta.biosVendor ?? null,
      Version: meta.biosVersion ?? null,
      ReleaseDate: meta.biosReleaseDate ?? null,
    },
    CPU: {
      Name: meta.cpuName ?? null,
      Cores: meta.cpuCores ?? null,
      LogicalCPUs: meta.cpuLogicalCpus ?? null,
      MaxClockMHz: meta.cpuMaxClockMHz ?? null,
      Socket: meta.cpuSocket ?? null,
    },

    RAMModules: ram || [],
    Storage: storage || [],
    GPUs: gpus || [],
    NICs: nics || [],

    PSU: meta.PSU ?? null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export async function setMetadataForIp(ip, metadataPayload) {
  if (!isValidIPv4(ip)) {
    const err = new Error("Neispravan IP");
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ipNumeric = ipToNumeric(ip);
    await conn.execute(
      `
      INSERT INTO ip_entries (ip, ip_numeric)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        ip_numeric = VALUES(ip_numeric)
      `,
      [ip, ipNumeric],
    );

    const [[ipEntryRow]] = await conn.execute(
      `SELECT id, metadata_id AS metadataId FROM ip_entries WHERE ip = ? LIMIT 1`,
      [ip],
    );
    if (!ipEntryRow) throw new Error("Failed to load ip_entries row");

    const ipEntryId = ipEntryRow.id;

    const cm = {
      ip_entry_id: ipEntryId,
      collected_at: asDateOrNull(pick(metadataPayload, "CollectedAt")),
      computer_name: asStr(pick(metadataPayload, "ComputerName")),
      user_name: asStr(pick(metadataPayload, "UserName")),

      os_caption: asStr(pick(metadataPayload, "OS.Caption")),
      os_version: asStr(pick(metadataPayload, "OS.Version")),
      os_build: asStr(pick(metadataPayload, "OS.Build")),
      os_install_date: asDateOrNull(pick(metadataPayload, "OS.InstallDate")),

      system_manufacturer: asStr(pick(metadataPayload, "System.Manufacturer")),
      system_model: asStr(pick(metadataPayload, "System.Model")),
      system_total_ram_gb: asNum(pick(metadataPayload, "System.TotalRAM_GB")),

      mb_manufacturer: asStr(pick(metadataPayload, "Motherboard.Manufacturer")),
      mb_product: asStr(pick(metadataPayload, "Motherboard.Product")),
      mb_serial: asStr(pick(metadataPayload, "Motherboard.Serial")),

      bios_vendor: asStr(pick(metadataPayload, "BIOS.Vendor")),
      bios_version: asStr(pick(metadataPayload, "BIOS.Version")),
      bios_release_date: asDateOrNull(
        pick(metadataPayload, "BIOS.ReleaseDate"),
      ),

      cpu_name: asStr(pick(metadataPayload, "CPU.Name")),
      cpu_cores: asNum(pick(metadataPayload, "CPU.Cores")),
      cpu_logical_cpus: asNum(pick(metadataPayload, "CPU.LogicalCPUs")),
      cpu_max_clock_mhz: asNum(pick(metadataPayload, "CPU.MaxClockMHz")),
      cpu_socket: asStr(pick(metadataPayload, "CPU.Socket")),

      psu: asStr(pick(metadataPayload, "PSU")),
    };

    await conn.execute(
      `
      INSERT INTO computer_metadata
      (
        ip_entry_id,
        collected_at,
        computer_name,
        user_name,
        os_caption, os_version, os_build, os_install_date,
        system_manufacturer, system_model, system_total_ram_gb,
        mb_manufacturer, mb_product, mb_serial,
        bios_vendor, bios_version, bios_release_date,
        cpu_name, cpu_cores, cpu_logical_cpus, cpu_max_clock_mhz, cpu_socket,
        psu
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        collected_at = VALUES(collected_at),
        computer_name = VALUES(computer_name),
        user_name = VALUES(user_name),
        os_caption = VALUES(os_caption),
        os_version = VALUES(os_version),
        os_build = VALUES(os_build),
        os_install_date = VALUES(os_install_date),
        system_manufacturer = VALUES(system_manufacturer),
        system_model = VALUES(system_model),
        system_total_ram_gb = VALUES(system_total_ram_gb),
        mb_manufacturer = VALUES(mb_manufacturer),
        mb_product = VALUES(mb_product),
        mb_serial = VALUES(mb_serial),
        bios_vendor = VALUES(bios_vendor),
        bios_version = VALUES(bios_version),
        bios_release_date = VALUES(bios_release_date),
        cpu_name = VALUES(cpu_name),
        cpu_cores = VALUES(cpu_cores),
        cpu_logical_cpus = VALUES(cpu_logical_cpus),
        cpu_max_clock_mhz = VALUES(cpu_max_clock_mhz),
        cpu_socket = VALUES(cpu_socket),
        psu = VALUES(psu)
      `,
      [
        cm.ip_entry_id,
        cm.collected_at,
        cm.computer_name,
        cm.user_name,

        cm.os_caption,
        cm.os_version,
        cm.os_build,
        cm.os_install_date,

        cm.system_manufacturer,
        cm.system_model,
        cm.system_total_ram_gb,

        cm.mb_manufacturer,
        cm.mb_product,
        cm.mb_serial,

        cm.bios_vendor,
        cm.bios_version,
        cm.bios_release_date,

        cm.cpu_name,
        cm.cpu_cores,
        cm.cpu_logical_cpus,
        cm.cpu_max_clock_mhz,
        cm.cpu_socket,

        cm.psu,
      ],
    );

    const [[metaRow]] = await conn.execute(
      `SELECT id FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
      [ipEntryId],
    );
    if (!metaRow) throw new Error("Failed to load computer_metadata row");
    const metadataId = metaRow.id;

    await conn.execute(`UPDATE ip_entries SET metadata_id = ? WHERE id = ?`, [
      metadataId,
      ipEntryId,
    ]);

    await conn.execute(
      `DELETE FROM computer_metadata_ram_modules WHERE metadata_id = ?`,
      [metadataId],
    );
    await conn.execute(
      `DELETE FROM computer_metadata_storage WHERE metadata_id = ?`,
      [metadataId],
    );
    await conn.execute(
      `DELETE FROM computer_metadata_gpus WHERE metadata_id = ?`,
      [metadataId],
    );
    await conn.execute(
      `DELETE FROM computer_metadata_nics WHERE metadata_id = ?`,
      [metadataId],
    );

    const ramModules = Array.isArray(metadataPayload?.RAMModules)
      ? metadataPayload.RAMModules
      : [];
    for (const r of ramModules) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_ram_modules
          (metadata_id, slot, manufacturer, part_number, serial, capacity_gb, speed_mtps, form_factor)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          metadataId,
          asStr(r?.Slot),
          asStr(r?.Manufacturer),
          asStr(r?.PartNumber),
          asStr(r?.Serial),
          asNum(r?.CapacityGB),
          asNum(r?.SpeedMTps),
          asStr(r?.FormFactor),
        ],
      );
    }

    const storage = Array.isArray(metadataPayload?.Storage)
      ? metadataPayload.Storage
      : [];
    for (const s of storage) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_storage
          (metadata_id, model, serial, firmware, size_gb, media_type, bus_type, device_id)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          metadataId,
          asStr(s?.Model),
          asStr(s?.Serial),
          asStr(s?.Firmware),
          asNum(s?.SizeGB),
          asStr(s?.MediaType),
          asStr(s?.BusType),
          asStr(s?.DeviceID),
        ],
      );
    }

    const gpus = Array.isArray(metadataPayload?.GPUs)
      ? metadataPayload.GPUs
      : [];
    for (const g of gpus) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_gpus
          (metadata_id, name, driver_vers, vram_gb)
        VALUES
          (?, ?, ?, ?)
        `,
        [metadataId, asStr(g?.Name), asStr(g?.DriverVers), asNum(g?.VRAM_GB)],
      );
    }

    const nics = Array.isArray(metadataPayload?.NICs)
      ? metadataPayload.NICs
      : [];
    for (const n of nics) {
      await conn.execute(
        `
        INSERT INTO computer_metadata_nics
          (metadata_id, name, mac, speed_mbps)
        VALUES
          (?, ?, ?, ?)
        `,
        [metadataId, asStr(n?.Name), asStr(n?.MAC), asNum(n?.SpeedMbps)],
      );
    }

    await conn.commit();

    const ipEntry = await getIpEntryById(conn, ipEntryId);
    const metadata = await getMetadataByIpEntryId(conn, ipEntryId);

    return { ipEntry, metadata };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}
    throw e;
  } finally {
    conn.release();
  }
}
