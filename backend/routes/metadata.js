import express from "express";
import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";

const router = express.Router();

const META_PROJECTION = {
  ComputerName: 1,
  UserName: 1,
  CollectedAt: 1,
  OS: { Caption: 1, Version: 1, Build: 1, InstallDate: 1 },
  System: { Manufacturer: 1, Model: 1, TotalRAM_GB: 1 },
  CPU: { Name: 1, Cores: 1, LogicalCPUs: 1, MaxClockMHz: 1 },
  RAMModules: {
    CapacityGB: 1,
    Slot: 1,
    Manufacturer: 1,
    PartNumber: 1,
    Serial: 1,
    SpeedMTps: 1,
    FormFactor: 1,
  },
  Storage: {
    Model: 1,
    Serial: 1,
    Firmware: 1,
    SizeGB: 1,
    MediaType: 1,
    BusType: 1,
    DeviceID: 1,
  },
  GPUs: { Name: 1, DriverVers: 1, VRAM_GB: 1 },
  NICs: { Name: 1, MAC: 1, SpeedMbps: 1 },
  createdAt: 1,
  updatedAt: 1,
};

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ComputerMetadata.find({}, META_PROJECTION).skip(skip).limit(limit).lean(),
      ComputerMetadata.estimatedDocumentCount(),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to list metadata" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const includeMeta =
      String(req.query.includeMeta || "").toLowerCase() === "true";

    const [totalIpEntries, totalWithMeta] = await Promise.all([
      IpEntry.estimatedDocumentCount(),
      ComputerMetadata.estimatedDocumentCount(),
    ]);

    const ramAgg = await ComputerMetadata.aggregate([
      {
        $addFields: {
          ramTotal: {
            $ifNull: [
              "$System.TotalRAM_GB",
              { $sum: "$RAMModules.CapacityGB" },
            ],
          },
        },
      },
      { $project: { ramTotal: { $ifNull: ["$ramTotal", 0] } } },
    ]);

    const ramTotals = ramAgg.map((x) => Number(x.ramTotal) || 0);
    const avgRam = ramTotals.length
      ? ramTotals.reduce((a, b) => a + b, 0) / ramTotals.length
      : 0;
    const medRam = median(ramTotals);
    const maxRam = ramTotals.length ? Math.max(...ramTotals) : 0;

    const storageAgg = await ComputerMetadata.aggregate([
      { $unwind: { path: "$Storage", preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: null,
          totalGb: { $sum: { $toDouble: { $ifNull: ["$Storage.SizeGB", 0] } } },
          ssdCount: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: { $toUpper: "$Storage.MediaType" },
                    regex: /SSD/,
                  },
                },
                1,
                0,
              ],
            },
          },
          hddCount: {
            $sum: {
              $cond: [
                {
                  $regexMatch: {
                    input: { $toUpper: "$Storage.MediaType" },
                    regex: /HDD/,
                  },
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);
    const storage = storageAgg[0] || { totalGb: 0, ssdCount: 0, hddCount: 0 };

    const [withGpu, vramAgg] = await Promise.all([
      ComputerMetadata.countDocuments({ "GPUs.0": { $exists: true } }),
      ComputerMetadata.aggregate([
        { $unwind: { path: "$GPUs", preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            avgVramGb: {
              $avg: { $toDouble: { $ifNull: ["$GPUs.VRAM_GB", 0] } },
            },
          },
        },
      ]),
    ]);
    const avgVramGb = vramAgg[0]?.avgVramGb || 0;

    const osTop = await ComputerMetadata.aggregate([
      {
        $project: {
          key: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$OS.Caption", ""] },
                  " ",
                  { $ifNull: ["$OS.Version", ""] },
                ],
              },
            },
          },
        },
      },
      { $group: { _id: "$key", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, key: "$_id", count: 1 } },
    ]);

    const manufacturersTop = await ComputerMetadata.aggregate([
      {
        $project: {
          key: {
            $ifNull: ["$System.Manufacturer", "$Motherboard.Manufacturer"],
          },
        },
      },
      { $group: { _id: "$key", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
      { $project: { _id: 0, key: "$_id", count: 1 } },
    ]);

    const nicTop = await ComputerMetadata.aggregate([
      { $unwind: { path: "$NICs", preserveNullAndEmptyArrays: false } },
      {
        $project: { speed: { $toDouble: { $ifNull: ["$NICs.SpeedMbps", 0] } } },
      },
      {
        $project: {
          speedNorm: {
            $cond: [
              { $and: [{ $gte: ["$speed", 950] }, { $lte: ["$speed", 1100] }] },
              1000,
              "$speed",
            ],
          },
        },
      },
      { $group: { _id: "$speedNorm", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, key: { $toString: "$_id" }, count: 1 } },
    ]);

    const now = new Date();
    const start = new Date(now.getTime() - 13 * 24 * 3600 * 1000);
    const recencyAgg = await ComputerMetadata.aggregate([
      { $match: { CollectedAt: { $gte: start } } },
      {
        $group: {
          _id: { $dateTrunc: { date: "$CollectedAt", unit: "day" } },
          count: { $sum: 1 },
        },
      },
      { $project: { _id: 0, day: "$_id", count: 1 } },
      { $sort: { day: 1 } },
    ]);
    const recencySeries = (() => {
      const map = new Map(
        recencyAgg.map((d) => [new Date(d.day).toDateString(), d.count])
      );
      const out = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - i
        );
        out.push(map.get(d.toDateString()) || 0);
      }
      return out;
    })();

    const lowRamRows = await ComputerMetadata.aggregate([
      {
        $addFields: {
          TotalRAM_GB_calc: {
            $ifNull: [
              "$System.TotalRAM_GB",
              { $sum: "$RAMModules.CapacityGB" },
            ],
          },
        },
      },
      {
        $project: {
          _id: 0,
          ComputerName: { $ifNull: ["$ComputerName", "—"] },
          "OS.Caption": "$OS.Caption",
          CollectedAt: "$CollectedAt",
          TotalRAM_GB: { $ifNull: ["$TotalRAM_GB_calc", 0] },
        },
      },
      { $sort: { TotalRAM_GB: 1 } },
      { $limit: 10 },
    ]);

    const oldOsRows = await ComputerMetadata.aggregate([
      {
        $project: {
          _id: 0,
          ComputerName: { $ifNull: ["$ComputerName", "—"] },
          "OS.Caption": "$OS.Caption",
          "OS.InstallDate": "$OS.InstallDate",
          CollectedAt: "$CollectedAt",
        },
      },
      { $match: { "OS.InstallDate": { $ne: null } } },
      { $sort: { "OS.InstallDate": 1 } },
      { $limit: 10 },
    ]);

    const lexarFlagRows = await ComputerMetadata.aggregate([
      { $unwind: { path: "$Storage", preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          _mediaTypeUpper: {
            $toUpper: { $ifNull: ["$Storage.MediaType", ""] },
          },
          _model: { $ifNull: ["$Storage.Model", ""] },
        },
      },
      {
        $match: {
          _model: { $regex: /lexar/i },
          _mediaTypeUpper: { $regex: /SSD/ },
        },
      },
      {
        $project: {
          _id: 0,
          ComputerName: { $ifNull: ["$ComputerName", "—"] },
          Storage: {
            Model: "$Storage.Model",
            Serial: "$Storage.Serial",
            SizeGB: { $toDouble: { $ifNull: ["$Storage.SizeGB", 0] } },
            MediaType: "$Storage.MediaType",
          },
          CollectedAt: "$CollectedAt",
        },
      },
      { $sort: { ComputerName: 1 } },
    ]);

    let meta = undefined;
    if (includeMeta) {
      meta = await ComputerMetadata.find({}, META_PROJECTION)
        .limit(10000)
        .lean();
    }

    res.json({
      stats: {
        totalWithMeta,
        avgRamGb: round1(avgRam),
        medRamGb: round1(medRam),
        maxRamGb: round1(maxRam),
        ssdCount: storage.ssdCount || 0,
        hddCount: storage.hddCount || 0,
        totalStorageTb: round1((storage.totalGb || 0) / 1024),
        withGpu,
        withoutGpu: Math.max(totalWithMeta - withGpu, 0),
        avgVramGb: round1(avgVramGb),
        coveragePct: totalIpEntries
          ? Math.round((totalWithMeta / totalIpEntries) * 100)
          : 100,
      },
      cover: { totalIpEntries, totalWithMeta },
      topOs: osTop,
      topManufacturers: manufacturersTop,
      topNicSpeeds: nicTop,
      recencySeries,
      tables: {
        lowRam: lowRamRows,
        oldOs: oldOsRows,
        lexarFlag: lexarFlagRows,
      },
      flags: {
        lexarCount: lexarFlagRows.length,
      },
      meta,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to build metadata stats" });
  }
});

export default router;
