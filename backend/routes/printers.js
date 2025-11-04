import express from "express";
import Printer from "../models/Printer.js";
import IpEntry from "../models/IpEntry.js";
import mongoose from "mongoose";
import { ah } from "../utils/asyncHandler.js";
import XLSX from "xlsx";

const router = express.Router();

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

async function findIpEntryByIpOrId(ipOrId) {
  if (!ipOrId) return null;
  const conds = [{ ip: ipOrId }];
  if (mongoose.isValidObjectId(ipOrId)) conds.push({ _id: ipOrId });
  return IpEntry.findOne({ $or: conds }).lean();
}

function hasAnyConnected(p) {
  return (p?.connectedComputers?.length ?? 0) > 0;
}

router.get(
  "/export-xlsx",
  ah(async (req, res) => {
    const search = String(req.query.search || "");
    const match = buildPrinterSearch(search);

    const data = await Printer.aggregate([
      { $match: match },
      { $sort: { ipNumeric: 1, name: 1 } },
      {
        $lookup: {
          from: "ipentries",
          localField: "hostComputer",
          foreignField: "_id",
          as: "host",
          pipeline: [
            {
              $project: { ip: 1, computerName: 1, username: 1, department: 1 },
            },
          ],
        },
      },
      { $addFields: { host: { $first: "$host" } } },
      {
        $lookup: {
          from: "ipentries",
          localField: "connectedComputers",
          foreignField: "_id",
          as: "connected",
          pipeline: [
            {
              $project: { ip: 1, computerName: 1, username: 1, department: 1 },
            },
          ],
        },
      },
    ]);

    const printerRows = data.map((p) => ({
      Name: p.name || "",
      Manufacturer: p.manufacturer || "",
      Model: p.model || "",
      Serial: p.serial || "",
      Department: p.department || "",
      ConnectionType: p.connectionType || "",
      IP: p.ip || "",
      Shared: !!p.shared,
      Host_ComputerName: p.host?.computerName || "",
      Host_IP: p.host?.ip || "",
      ConnectedCount: Array.isArray(p.connected) ? p.connected.length : 0,
      ConnectedList:
        Array.isArray(p.connected) && p.connected.length
          ? p.connected
              .map(
                (c) =>
                  `${c.computerName || ""}${c.computerName && c.ip ? " " : ""}${
                    c.ip ? `(${c.ip})` : ""
                  }`
              )
              .join(", ")
          : "",
      UpdatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
      CreatedAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
    }));

    const connectionRows = [];
    for (const p of data) {
      if (p.host) {
        connectionRows.push({
          PrinterName: p.name || "",
          PrinterIP: p.ip || "",
          Role: "HOST",
          ComputerName: p.host.computerName || "",
          ComputerIP: p.host.ip || "",
          Department: p.host.department || "",
        });
      }
      if (Array.isArray(p.connected)) {
        for (const c of p.connected) {
          connectionRows.push({
            PrinterName: p.name || "",
            PrinterIP: p.ip || "",
            Role: "CONNECTED",
            ComputerName: c.computerName || "",
            ComputerIP: c.ip || "",
            Department: c.department || "",
          });
        }
      }
    }

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(printerRows);
    autosizeSheet(ws1, Object.keys(printerRows[0] || {}));
    XLSX.utils.book_append_sheet(wb, ws1, "Printers");

    const ws2 = XLSX.utils.json_to_sheet(connectionRows);
    autosizeSheet(
      ws2,
      Object.keys(
        connectionRows[0] || {
          PrinterName: "",
          PrinterIP: "",
          Role: "",
          ComputerName: "",
          ComputerIP: "",
          Department: "",
        }
      )
    );
    XLSX.utils.book_append_sheet(wb, ws2, "Connections");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `NetDesk_Printers_${dateStamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  })
);

router.get(
  "/",
  ah(async (req, res) => {
    const rawPage = parseInt(req.query.page);
    const rawLimit = parseInt(req.query.limit);
    const search = String(req.query.search || "");

    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isFinite(rawLimit)
      ? Math.min(1000, Math.max(1, rawLimit))
      : 50;

    const skip = (page - 1) * limit;
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
        { $project: { connectedComputers: 0 } },
      ]),
      Printer.aggregate([{ $match: match }, { $count: "total" }]),
    ]);

    const total = totalArr[0]?.total || 0;
    res.json({
      items,
      page,
      limit,
      search,
      total,
      totalPages: Math.ceil(total / limit),
    });
  })
);

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
    res.status(201).json(p.toObject());
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

router.post(
  "/:id/set-host",
  ah(async (req, res) => {
    const { computer } = req.body;
    const host = await findIpEntryByIpOrId(computer);
    if (!host)
      return res.status(404).json({ error: "Host computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { hostComputer: host._id },
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
      { $addToSet: { connectedComputers: pc._id }, $set: { shared: true } },
      { new: true }
    )
      .populate("hostComputer", "ip computerName username department")
      .populate("connectedComputers", "ip computerName username department")
      .lean();

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

    let p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $pull: { connectedComputers: pc._id } },
      { new: true }
    )
      .populate("hostComputer", "ip computerName username department")
      .populate("connectedComputers", "ip computerName username department")
      .lean();

    if (!p) return res.status(404).json({ error: "Printer not found" });

    const shouldShare = hasAnyConnected(p);
    if (p.shared !== shouldShare) {
      p = await Printer.findByIdAndUpdate(
        req.params.id,
        { $set: { shared: shouldShare } },
        { new: true }
      )
        .populate("hostComputer", "ip computerName username department")
        .populate("connectedComputers", "ip computerName username department")
        .lean();
    }

    res.json(p);
  })
);

function autosizeSheet(worksheet, headerKeys) {
  if (!worksheet || !headerKeys || headerKeys.length === 0) return;
  const colWidths = headerKeys.map((h) => (h ? String(h).length : 10));

  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let max = colWidths[C - range.s.c] || 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || !cell.v) continue;
      const len = String(cell.v).length;
      if (len > max) max = len;
    }
    colWidths[C - range.s.c] = Math.min(Math.max(max + 2, 10), 60);
  }
  worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
}

export default router;
