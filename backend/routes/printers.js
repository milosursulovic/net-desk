import express from "express";
import Printer from "../models/Printer.js";
import IpEntry from "../models/IpEntry.js";

const router = express.Router();

const getSearchQuery = (q = "") => ({
  $or: [
    { name: { $regex: q, $options: "i" } },
    { manufacturer: { $regex: q, $options: "i" } },
    { model: { $regex: q, $options: "i" } },
    { serial: { $regex: q, $options: "i" } },
    { department: { $regex: q, $options: "i" } },
    { ip: { $regex: q, $options: "i" } },
  ],
});

router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || "");

    const [items, total] = await Promise.all([
      Printer.find(getSearchQuery(search))
        .sort({ ipNumeric: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .populate("hostComputer", "ip computerName username department")
        .populate("connectedComputers", "ip computerName username department")
        .lean(),
      Printer.countDocuments(getSearchQuery(search)),
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
    res.status(500).json({ error: "Failed to list printers" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const p = await Printer.findById(req.params.id)
      .populate("hostComputer", "ip computerName username department")
      .populate("connectedComputers", "ip computerName username department")
      .lean();
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const p = new Printer(req.body);
    await p.save();
    res.status(201).json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create printer" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const p = await Printer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update printer" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const del = await Printer.findByIdAndDelete(req.params.id);
    if (!del) return res.status(404).json({ error: "Printer not found" });
    return res.json({ message: "Printer deleted" });
  } catch (err) {
    console.error("Error deleting printer:", err);
    res.status(500).json({ error: "Server error" });
  }
});

async function findIpEntryByIpOrId(ipOrId) {
  if (!ipOrId) return null;
  const asIp = await IpEntry.findOne({ ip: ipOrId }).lean();
  if (asIp) return asIp;
  try {
    const asId = await IpEntry.findById(ipOrId).lean();
    return asId || null;
  } catch {
    return null;
  }
}

router.post("/:id/set-host", async (req, res) => {
  try {
    const { computer } = req.body;
    const host = await findIpEntryByIpOrId(computer);
    if (!host)
      return res.status(404).json({ error: "Host computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { hostComputer: host._id, shared: true },
      { new: true }
    );
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to set host" });
  }
});

router.post("/:id/unset-host", async (req, res) => {
  try {
    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $unset: { hostComputer: 1 } },
      { new: true }
    );
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to unset host" });
  }
});

router.post("/:id/connect", async (req, res) => {
  try {
    const { computer } = req.body;
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc) return res.status(404).json({ error: "Computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { connectedComputers: pc._id } },
      { new: true }
    );
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to connect computer" });
  }
});

router.post("/:id/disconnect", async (req, res) => {
  try {
    const { computer } = req.body; // ip ili _id
    const pc = await findIpEntryByIpOrId(computer);
    if (!pc) return res.status(404).json({ error: "Computer not found" });

    const p = await Printer.findByIdAndUpdate(
      req.params.id,
      { $pull: { connectedComputers: pc._id } },
      { new: true }
    );
    if (!p) return res.status(404).json({ error: "Printer not found" });
    res.json(p);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to disconnect computer" });
  }
});

export default router;
