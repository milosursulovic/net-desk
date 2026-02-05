import { emptyToNull } from "../utils/strings.js";
import { isValidIPv4 } from "../utils/ip.js";
import { findIpEntryIdByIp } from "../repositories/ipEntries.repo.js";
import {
  loadMetadataBaseById,
  loadMetadataChildren,
  findMetadataIdByIpEntryId,
  listMetadataIds,
  countMetadataTotal,
  beginTx,
  commitTx,
  rollbackTx,
  txGetExistingMetaId,
  txInsertMeta,
  txUpdateMeta,
  txAttachMetadataToIpEntry,
  txReplaceRam,
  txReplaceStorage,
  txReplaceGpus,
  txReplaceNics,
  statsTotalIpEntries,
  statsTotalWithMeta,
  statsRamTotals,
  statsStorageAgg,
  statsGpuCounts,
  statsTopOs,
  statsTopManufacturers,
  statsTopNicSpeedsRaw,
  statsRecencyAgg,
  statsLowRamRows,
  statsOldOsRows,
  statsLexarFlagRows,
} from "../repositories/metadata.repo.js";

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }
  return undefined;
}

function parseDateMaybe(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v.$date) {
    const d = new Date(v.$date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
}

function mapMeta(meta, children) {
  if (!meta) return null;
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
      LogicalCPUs: meta.cpuLogicalCPus ?? null,
      MaxClockMHz: meta.cpuMaxClockMHz ?? null,
      Socket: meta.cpuSocket ?? null,
    },

    RAMModules: children?.ram || [],
    Storage: children?.storage || [],
    GPUs: children?.gpus || [],
    NICs: children?.nics || [],

    PSU: meta.PSU ?? null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

async function loadMetadataById(metadataId) {
  const base = await loadMetadataBaseById(metadataId);
  if (!base) return null;
  const children = await loadMetadataChildren(metadataId);
  return mapMeta(base, children);
}

export async function listMetadataPage({ page, limit }) {
  const total = await countMetadataTotal();
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const safePage =
    totalPages === 0 ? 1 : Math.max(1, Math.min(page, totalPages));
  const offset = (safePage - 1) * limit;

  const ids = await listMetadataIds(offset, limit);
  const items = [];
  for (const r of ids) {
    const obj = await loadMetadataById(r.id);
    if (obj) items.push(obj);
  }

  return { items, total, totalPages, page: safePage, limit };
}

async function upsertMetadataForIpEntry(ipEntryId, body) {
  const OS = pick(body, ["OS", "os"]) || {};
  const System = pick(body, ["System", "system"]) || {};
  const Motherboard = pick(body, ["Motherboard", "motherboard"]) || {};
  const BIOS = pick(body, ["BIOS", "bios"]) || {};
  const CPU = pick(body, ["CPU", "cpu"]) || {};

  const RAMModules = pick(body, ["RAMModules", "ramModules"]) || [];
  const Storage = pick(body, ["Storage", "storage"]) || [];
  const GPUs = pick(body, ["GPUs", "gpus"]) || [];
  const NICs = pick(body, ["NICs", "nics"]) || [];

  const collectedAt = parseDateMaybe(
    pick(body, ["CollectedAt", "collectedAt"]),
  );
  const computerName = emptyToNull(
    pick(body, ["ComputerName", "computerName"]),
  );
  const userName = emptyToNull(pick(body, ["UserName", "userName"]));
  const psu = emptyToNull(pick(body, ["PSU", "psu"]));

  const data = {
    collectedAt,
    computerName,
    userName,

    osCaption: emptyToNull(OS.Caption ?? OS.caption),
    osVersion: emptyToNull(OS.Version ?? OS.version),
    osBuild: emptyToNull(OS.Build ?? OS.build),
    osInstallDate: parseDateMaybe(OS.InstallDate ?? OS.installDate),

    systemManufacturer: emptyToNull(System.Manufacturer ?? System.manufacturer),
    systemModel: emptyToNull(System.Model ?? System.model),
    systemTotalRamGb:
      System.TotalRAM_GB ?? System.totalRamGb ?? System.totalRAM_GB ?? null,

    mbManufacturer: emptyToNull(
      Motherboard.Manufacturer ?? Motherboard.manufacturer,
    ),
    mbProduct: emptyToNull(Motherboard.Product ?? Motherboard.product),
    mbSerial: emptyToNull(Motherboard.Serial ?? Motherboard.serial),

    biosVendor: emptyToNull(BIOS.Vendor ?? BIOS.vendor),
    biosVersion: emptyToNull(BIOS.Version ?? BIOS.version),
    biosReleaseDate: parseDateMaybe(BIOS.ReleaseDate ?? BIOS.releaseDate),

    cpuName: emptyToNull(CPU.Name ?? CPU.name),
    cpuCores: CPU.Cores ?? CPU.cores ?? null,
    cpuLogical: CPU.LogicalCPUs ?? CPU.logicalCPUs ?? null,
    cpuMaxClock: CPU.MaxClockMHz ?? CPU.maxClockMHz ?? null,
    cpuSocket: emptyToNull(CPU.Socket ?? CPU.socket),

    psu,
  };

  const normalizeModules = (arr, mapFn) =>
    (Array.isArray(arr) ? arr : []).map(mapFn);

  const ramNorm = normalizeModules(RAMModules, (m) => ({
    slot: emptyToNull(m.Slot ?? m.slot),
    manufacturer: emptyToNull(m.Manufacturer ?? m.manufacturer),
    partNumber: emptyToNull(m.PartNumber ?? m.partNumber),
    serial: emptyToNull(m.Serial ?? m.serial),
    capacityGb: m.CapacityGB ?? m.capacityGB ?? null,
    speedMtps: m.SpeedMTps ?? m.speedMTps ?? null,
    formFactor: emptyToNull(m.FormFactor ?? m.formFactor),
  }));

  const storageNorm = normalizeModules(Storage, (s) => ({
    model: emptyToNull(s.Model ?? s.model),
    serial: emptyToNull(s.Serial ?? s.serial),
    firmware: emptyToNull(s.Firmware ?? s.firmware),
    sizeGb: s.SizeGB ?? s.sizeGB ?? null,
    mediaType: emptyToNull(s.MediaType ?? s.mediaType),
    busType: emptyToNull(s.BusType ?? s.busType),
    deviceId: emptyToNull(s.DeviceID ?? s.deviceID),
  }));

  const gpusNorm = normalizeModules(GPUs, (g) => ({
    name: emptyToNull(g.Name ?? g.name),
    driverVers: emptyToNull(g.DriverVers ?? g.driverVers),
    vramGb: g.VRAM_GB ?? g.vram_gb ?? g.vramGb ?? null,
  }));

  const nicsNorm = normalizeModules(NICs, (n) => ({
    name: emptyToNull(n.Name ?? n.name),
    mac: emptyToNull(n.MAC ?? n.mac),
    speedMbps: n.SpeedMbps ?? n.speedMbps ?? null,
  }));

  const conn = await beginTx();
  try {
    const existingId = await txGetExistingMetaId(conn, ipEntryId);

    let metadataId;
    if (!existingId) {
      metadataId = await txInsertMeta(conn, ipEntryId, data);
      await txAttachMetadataToIpEntry(conn, ipEntryId, metadataId);
    } else {
      metadataId = existingId;
      await txUpdateMeta(conn, metadataId, data);
    }

    await txReplaceRam(conn, metadataId, ramNorm);
    await txReplaceStorage(conn, metadataId, storageNorm);
    await txReplaceGpus(conn, metadataId, gpusNorm);
    await txReplaceNics(conn, metadataId, nicsNorm);

    await commitTx(conn);
    return await loadMetadataById(metadataId);
  } catch (e) {
    await rollbackTx(conn);
    throw e;
  }
}

export async function upsertMetadataByIp(ip, body) {
  if (!isValidIPv4(ip)) {
    const err = new Error("Neispravan IP");
    err.status = 400;
    throw err;
  }

  const ipEntryId = await findIpEntryIdByIp(ip);
  if (!ipEntryId) {
    const err = new Error("IpEntry not found");
    err.status = 404;
    throw err;
  }

  return await upsertMetadataForIpEntry(ipEntryId, body);
}

export async function getMetadataByIp(ip) {
  if (!isValidIPv4(ip)) {
    const err = new Error("Neispravan IP");
    err.status = 400;
    throw err;
  }

  const ipEntryId = await findIpEntryIdByIp(ip);
  if (!ipEntryId) {
    const err = new Error("Not found");
    err.status = 404;
    throw err;
  }

  const metaId = await findMetadataIdByIpEntryId(ipEntryId);
  if (!metaId) {
    const err = new Error("Metadata not found");
    err.status = 404;
    throw err;
  }

  const meta = await loadMetadataById(metaId);
  return { ipEntryId, metadata: meta };
}

export async function patchMetadataByIp(ip, patchBody) {
  if (!isValidIPv4(ip)) {
    const err = new Error("Neispravan IP");
    err.status = 400;
    throw err;
  }

  const ipEntryId = await findIpEntryIdByIp(ip);
  if (!ipEntryId) {
    const err = new Error("IpEntry not found");
    err.status = 404;
    throw err;
  }

  const metaId = await findMetadataIdByIpEntryId(ipEntryId);
  const existing = metaId ? await loadMetadataById(metaId) : {};

  const merged = { ...(existing || {}), ...(patchBody || {}) };

  for (const k of ["OS", "System", "Motherboard", "BIOS", "CPU"]) {
    if (patchBody?.[k])
      merged[k] = { ...(existing?.[k] || {}), ...(patchBody[k] || {}) };
  }
  for (const k of ["RAMModules", "Storage", "GPUs", "NICs"]) {
    if (!Object.prototype.hasOwnProperty.call(patchBody || {}, k)) {
      merged[k] = existing?.[k] || [];
    }
  }

  return await upsertMetadataForIpEntry(ipEntryId, merged);
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

export async function statsService(includeMeta = false) {
  const totalIpEntries = await statsTotalIpEntries();
  const totalWithMeta = await statsTotalWithMeta();

  const ramRows = await statsRamTotals();
  const ramTotals = ramRows.map((x) => Number(x.ramTotal) || 0);
  const avgRam = ramTotals.length
    ? ramTotals.reduce((a, b) => a + b, 0) / ramTotals.length
    : 0;
  const medRam = median(ramTotals);
  const maxRam = ramTotals.length ? Math.max(...ramTotals) : 0;

  const storage = await statsStorageAgg();
  const gpu = await statsGpuCounts();

  const osTop = await statsTopOs();
  const manufacturersTop = await statsTopManufacturers();
  const nicTopRaw = await statsTopNicSpeedsRaw();
  const nicTop = nicTopRaw.map((r) => ({
    key: String(r.speedNorm),
    count: r.count,
  }));

  const now = new Date();
  const start = new Date(now.getTime() - 13 * 24 * 3600 * 1000);
  const recencyAgg = await statsRecencyAgg(start);

  const recencyMap = new Map(
    recencyAgg.map((d) => [
      new Date(d.day).toDateString(),
      Number(d.count) || 0,
    ]),
  );
  const recencySeries = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (13 - i),
    );
    return recencyMap.get(d.toDateString()) || 0;
  });

  const lowRamRows = await statsLowRamRows();
  const lowRam = lowRamRows.map((r) => ({
    ComputerName: r.ComputerName,
    "OS.Caption": r.osCaption ?? null,
    CollectedAt: r.CollectedAt ?? null,
    TotalRAM_GB: Number(r.TotalRAM_GB) || 0,
  }));

  const oldOsRows = await statsOldOsRows();
  const oldOs = oldOsRows.map((r) => ({
    ComputerName: r.ComputerName,
    "OS.Caption": r.osCaption ?? null,
    "OS.InstallDate": r.osInstallDate ?? null,
    CollectedAt: r.CollectedAt ?? null,
  }));

  const lexarFlagRows = await statsLexarFlagRows();
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
    meta = undefined;
  }

  return {
    stats: {
      totalWithMeta,
      avgRamGb: round1(avgRam),
      medRamGb: round1(medRam),
      maxRamGb: round1(maxRam),
      ssdCount: Number(storage.ssdCount) || 0,
      hddCount: Number(storage.hddCount) || 0,
      totalStorageTb: round1((Number(storage.totalGb) || 0) / 1024),
      withGpu: gpu.withGpu,
      withoutGpu: Math.max(totalWithMeta - gpu.withGpu, 0),
      avgVramGb: round1(gpu.avgVramGb),
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
  };
}
