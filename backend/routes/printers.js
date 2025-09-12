import express from "express";
import Printer from "../models/Printer.js";
import IpEntry from "../models/IpEntry.js";
import mongoose from "mongoose";
import { ah } from "../utils/asyncHandler.js";

const router = express.Router();

// Brži search: prefiksi i *_lc fallback
const buildPrinterSearch = (raw = "") => {
  const q = String(raw || "").trim();
  if (!q) return {};
  const t = q.toLowerCase();
  const ipPrefix = t.replace(/\./g, "\\.");
  return {
    $or: [
      { ip: { $regex: `^${ipPrefix}` } },
      { name: { $regex: t, $options: "i" } },
      { manufacturer: { $regex: t, $options: "i" } },
      { model: { $regex: t, $options: "i" } },
      { serial: { $regex: t, $options: "i" } },
      { department: { $regex: t, $options: "i" } },
    ],
  };
};

// LIST — lagani prikaz: host minimalno, broj konekcija umesto popisa
router.get(
  "/",
  ah(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "");

    const match = buildPrinterSearch(search);

    const [items, totalArr] = await Promise.all([
      Printer.aggregate([
        { $match: match },
        { $sort: { ipNumeric: 1, name: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "ipentries",
            localField: "hostComputer",
            foreignField: "_id",
            as: "host",
            pipeline: [
              {
                $project: {
                  ip: 1,
                  computerName: 1,
                  username: 1,
                  department: 1,
                },
              },
            ],
          },
        },
        { $addFields: { host: { $first: "$host" } } },
        {
          $addFields: {
            connectedCount: { $size: { $ifNull: ["$connectedComputers", []] } },
          },
        },
        { $project: { /* sakrij listu radi brzine */ connectedComputers: 0 } },
      ]),
      Printer.aggregate([{ $match: match }, { $count: "total" }]),
    ]);

    const total = totalArr[0]?.total || 0;
    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  })
);

// DETAIL — pune populate liste
router.get(
  "/:id",
  ah(async (req, res) => {
    const p = await Printer.findById(req.params.id)
      .populate("hostComputer", "ip computerName username department")
      .populate("connectedComputers", "ip computerName username department")
      .lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

router.post(
  "/",
  ah(async (req, res) => {
    const p = new Printer(req.body);
    await p.save();
    res.status(201).json(p);
  })
);

router.put(
  "/:id",
  ah(async (req, res) => {
    const p = await Printer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    }).lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

router.delete(
  "/:id",
  ah(async (req, res) => {
    const del = await Printer.findByIdAndDelete(req.params.id).lean();
    if (!del) return res.status(404).json({ error: "Printer not found" });
    return res.json({ message: "Printer deleted" });
  })
);

async function findIpEntryByIpOrId(ipOrId) {
  if (!ipOrId) return null;
  const conds = [{ ip: ipOrId }];
  if (mongoose.isValidObjectId(ipOrId)) conds.push({ _id: ipOrId });
  return IpEntry.findOne({ $or: conds }).lean();
}

router.post(
  "/:id/set-host",
  ah(async (req, res) => {
    const { computer } = req.body;
    const host = await findIpEntryByIpOrId(computer);
    if (!host)
      return res.status(404).json({ error: "Host computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { hostComputer: host._id, shared: true },
      { new: true }
    ).lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

router.post(
  "/:id/unset-host",
  ah(async (req, res) => {
    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $unset: { hostComputer: 1 } },
      { new: true }
    ).lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

router.post(
  "/:id/connect",
  ah(async (req, res) => {
    const { computer } = req.body;
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc) return res.status(404).json({ error: "Computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { connectedComputers: pc._id } },
      { new: true }
    ).lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

router.post(
  "/:id/disconnect",
  ah(async (req, res) => {
    const { computer } = req.body;
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc) return res.status(404).json({ error: "Computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $pull: { connectedComputers: pc._id } },
      { new: true }
    ).lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  })
);

export default router;
