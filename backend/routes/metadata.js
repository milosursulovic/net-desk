import express from "express";
import { pool } from "../index.js";
import { ah } from "../utils/asyncHandler.js";

const router = express.Router();

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

function toInt(v, def = null) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : def;
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function loadMetadataById(metadataId) {
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
    [metadataId]
  );

  if (!meta) return null;

  const [ram] = await pool.execute(
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
    [metadataId]
  );

  const [storage] = await pool.execute(
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
    [metadataId]
  );

  const [gpus] = await pool.execute(
    `SELECT
        name AS Name,
        driver_vers AS DriverVers,
        vram_gb AS VRAM_GB
     FROM computer_metadata_gpus
     WHERE metadata_id = ?`,
    [metadataId]
  );

  const [nics] = await pool.execute(
    `SELECT
        name AS Name,
        mac AS MAC,
        speed_mbps AS SpeedMbps
     FROM computer_metadata_nics
     WHERE metadata_id = ?`,
    [metadataId]
  );

  return {
    _sqlId: meta.id,
    ipEntry: meta.ipEntryId,
    ComputerName: meta.ComputerName ?? null,
    UserName: meta.UserName ?? null,
    CollectedAt: meta.CollectedAt ?? null,

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

async function loadMetadataPage(offset, limit) {
  const [baseRows] = await pool.execute(
    `
    SELECT id
    FROM computer_metadata
    ORDER BY id DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset]
  );

  const items = [];
  for (const r of baseRows) {
    const obj = await loadMetadataById(r.id);
    if (obj) items.push(obj);
  }
  return items;
}

router.get(
  "/",
  ah(async (req, res) => {
    const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
    const limit = clamp(toInt(req.query.limit, 50), 1, 1000);
    const offset = (page - 1) * limit;

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM computer_metadata`
    );

    const items = await loadMetadataPage(offset, limit);

    res.json({
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    });
  })
);

router.get(
  "/stats",
  ah(async (req, res) => {
    const includeMeta =
      String(req.query.includeMeta || "").toLowerCase() === "true";

    const [[{ totalIpEntries }]] = await pool.execute(
      `SELECT COUNT(*) AS totalIpEntries FROM ip_entries`
    );
    const [[{ totalWithMeta }]] = await pool.execute(
      `SELECT COUNT(*) AS totalWithMeta FROM computer_metadata`
    );

    const [ramRows] = await pool.execute(
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
      `
    );

    const ramTotals = ramRows.map((x) => Number(x.ramTotal) || 0);
    const avgRam = ramTotals.length
      ? ramTotals.reduce((a, b) => a + b, 0) / ramTotals.length
      : 0;
    const medRam = median(ramTotals);
    const maxRam = ramTotals.length ? Math.max(...ramTotals) : 0;

    const [storageAggRows] = await pool.execute(
      `
      SELECT
        SUM(COALESCE(s.size_gb, 0)) AS totalGb,
        SUM(CASE WHEN UPPER(COALESCE(s.media_type,'')) LIKE '%SSD%' THEN 1 ELSE 0 END) AS ssdCount,
        SUM(CASE WHEN UPPER(COALESCE(s.media_type,'')) LIKE '%HDD%' THEN 1 ELSE 0 END) AS hddCount
      FROM computer_metadata_storage s
      `
    );
    const storage = storageAggRows?.[0] || { totalGb: 0, ssdCount: 0, hddCount: 0 };

    const [[{ withGpu }]] = await pool.execute(
      `SELECT COUNT(DISTINCT metadata_id) AS withGpu FROM computer_metadata_gpus`
    );
    const [[{ avgVramGb }]] = await pool.execute(
      `SELECT AVG(COALESCE(vram_gb, 0)) AS avgVramGb FROM computer_metadata_gpus`
    );

    const [osTop] = await pool.execute(
      `
      SELECT
        TRIM(CONCAT(COALESCE(os_caption,''), ' ', COALESCE(os_version,''))) AS \`key\`,
        COUNT(*) AS count
      FROM computer_metadata
      GROUP BY \`key\`
      ORDER BY count DESC
      LIMIT 5
      `
    );

    const [manufacturersTop] = await pool.execute(
      `
      SELECT
        COALESCE(NULLIF(system_manufacturer,''), NULLIF(mb_manufacturer,''), NULL) AS \`key\`,
        COUNT(*) AS count
      FROM computer_metadata
      GROUP BY \`key\`
      ORDER BY count DESC
      LIMIT 6
      `
    );

    const [nicTopRaw] = await pool.execute(
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
      `
    );
    const nicTop = nicTopRaw.map((r) => ({
      key: String(r.speedNorm),
      count: r.count,
    }));

    const now = new Date();
    const start = new Date(now.getTime() - 13 * 24 * 3600 * 1000);

    const [recencyAgg] = await pool.execute(
      `
      SELECT DATE(collected_at) AS day, COUNT(*) AS count
      FROM computer_metadata
      WHERE collected_at >= ?
      GROUP BY DATE(collected_at)
      ORDER BY day ASC
      `,
      [start]
    );

    const recencyMap = new Map(
      recencyAgg.map((d) => [new Date(d.day).toDateString(), Number(d.count) || 0])
    );
    const recencySeries = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (13 - i));
      return recencyMap.get(d.toDateString()) || 0;
    });

    const [lowRamRows] = await pool.execute(
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
      `
    );

    const lowRam = lowRamRows.map((r) => ({
      ComputerName: r.ComputerName,
      "OS.Caption": r.osCaption ?? null,
      CollectedAt: r.CollectedAt ?? null,
      TotalRAM_GB: Number(r.TotalRAM_GB) || 0,
    }));

    const [oldOsRows] = await pool.execute(
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
      `
    );

    const oldOs = oldOsRows.map((r) => ({
      ComputerName: r.ComputerName,
      "OS.Caption": r.osCaption ?? null,
      "OS.InstallDate": r.osInstallDate ?? null,
      CollectedAt: r.CollectedAt ?? null,
    }));

    const [lexarFlagRows] = await pool.execute(
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
      `
    );

    const lexarFlag = lexarFlagRows.map((r) => ({
      ComputerName: r.ComputerName,
      Storage: {
        Model: r.Model ?? null,
        Serial: r.Serial ?? null,
        SizeGB: Number(r.SizeGB) || 0,
        MediaType: r.MediaType ?? null,
      },
      CollectedAt: r.CollectedAt ?? null,
    }));

    let meta = undefined;
    if (includeMeta) {
      const [ids] = await pool.execute(
        `SELECT id FROM computer_metadata ORDER BY id DESC LIMIT 10000`
      );
      const out = [];
      for (const r of ids) {
        const obj = await loadMetadataById(r.id);
        if (obj) out.push(obj);
      }
      meta = out;
    }

    res.json({
      stats: {
        totalWithMeta,
        avgRamGb: round1(avgRam),
        medRamGb: round1(medRam),
        maxRamGb: round1(maxRam),
        ssdCount: Number(storage.ssdCount) || 0,
        hddCount: Number(storage.hddCount) || 0,
        totalStorageTb: round1((Number(storage.totalGb) || 0) / 1024),
        withGpu: Number(withGpu) || 0,
        withoutGpu: Math.max(totalWithMeta - (Number(withGpu) || 0), 0),
        avgVramGb: round1(Number(avgVramGb) || 0),
        coveragePct: totalIpEntries
          ? Math.round((totalWithMeta / totalIpEntries) * 100)
          : 100,
      },
      cover: { totalIpEntries, totalWithMeta },
      topOs: osTop.map((x) => ({ key: x.key, count: x.count })),
      topManufacturers: manufacturersTop
        .filter((x) => x.key != null && String(x.key).trim() !== "")
        .map((x) => ({ key: x.key, count: x.count })),
      topNicSpeeds: nicTop,
      recencySeries,
      tables: {
        lowRam,
        oldOs,
        lexarFlag,
      },
      flags: { lexarCount: lexarFlag.length },
      meta,
    });
  })
);

export default router;

