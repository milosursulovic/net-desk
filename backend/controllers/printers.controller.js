import XLSX from "xlsx";
import { toInt, clamp } from "../utils/numbers.js";
import {
  listPrintersService,
  getPrinterService,
  createPrinterService,
  updatePrinterService,
  deletePrinterService,
  setHostService,
  unsetHostService,
  connectComputerService,
  disconnectComputerService,
  exportPrintersService,
} from "../services/printers.service.js";

function autosizeSheet(worksheet, headerKeys) {
  if (!worksheet || !headerKeys || headerKeys.length === 0) return;
  const colWidths = headerKeys.map((h) => (h ? String(h).length : 10));

  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    let max = colWidths[C - range.s.c] || 10;
    for (let R = range.s.r; R <= range.e.r; ++R) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
      if (!cell || cell.v == null) continue;
      const len = String(cell.v).length;
      if (len > max) max = len;
    }
    colWidths[C - range.s.c] = Math.min(Math.max(max + 2, 10), 60);
  }
  worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
}

export async function exportXlsxPrintersController(req, res) {
  const search = String(req.query.search || "");
  const { printers, connections, connAgg } =
    await exportPrintersService(search);

  const connMap = new Map(
    connAgg.map((r) => [
      Number(r.printerId),
      {
        connectedCount: Number(r.connectedCount) || 0,
        connectedList: r.connectedList || "",
      },
    ]),
  );

  const printerRows = printers.map((p) => {
    const extra = connMap.get(Number(p.id)) || {
      connectedCount: 0,
      connectedList: "",
    };
    return {
      Name: p.name || "",
      Manufacturer: p.manufacturer || "",
      Model: p.model || "",
      Serial: p.serial || "",
      Department: p.department || "",
      ConnectionType: p.connectionType || "",
      IP: p.ip || "",
      Shared: !!p.shared,
      Host_ComputerName: p.hostComputerName || "",
      Host_IP: p.hostIp || "",
      ConnectedCount: extra.connectedCount,
      ConnectedList: extra.connectedList,
      UpdatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
      CreatedAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
    };
  });

  const wb = XLSX.utils.book_new();

  const ws1 = XLSX.utils.json_to_sheet(printerRows);
  autosizeSheet(ws1, Object.keys(printerRows[0] || {}));
  XLSX.utils.book_append_sheet(wb, ws1, "Printers");

  const ws2 = XLSX.utils.json_to_sheet(connections);
  autosizeSheet(
    ws2,
    Object.keys(
      connections[0] || {
        PrinterName: "",
        PrinterIP: "",
        Role: "",
        ComputerName: "",
        ComputerIP: "",
        Department: "",
      },
    ),
  );
  XLSX.utils.book_append_sheet(wb, ws2, "Connections");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `NetDesk_Printers_${dateStamp}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buf);
}

export async function listPrintersController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 1000);
  const search = String(req.query.search || "");
  const out = await listPrintersService({ page, limit, search });
  res.json(out);
}

export async function getPrinterController(req, res) {
  const id = toInt(req.params.id, null);
  if (!id) return res.status(400).json({ error: "Invalid printer id" });
  const out = await getPrinterService(id);
  res.json(out);
}

export async function createPrinterController(req, res) {
  const created = await createPrinterService(req.body || {});
  res.status(201).json(created);
}

export async function updatePrinterController(req, res) {
  const id = toInt(req.params.id, null);
  if (!id) return res.status(400).json({ error: "Invalid printer id" });

  const updated = await updatePrinterService(id, req.body || {});
  res.json(updated);
}

export async function deletePrinterController(req, res) {
  const id = toInt(req.params.id, null);
  if (!id) return res.status(400).json({ error: "Invalid printer id" });

  await deletePrinterService(id);
  res.json({ message: "Printer deleted" });
}

export async function setHostController(req, res) {
  const printerId = toInt(req.params.id, null);
  if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

  const { computer } = req.body || {};
  const updated = await setHostService(printerId, computer);
  res.json(updated);
}

export async function unsetHostController(req, res) {
  const printerId = toInt(req.params.id, null);
  if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

  const updated = await unsetHostService(printerId);
  res.json(updated);
}

export async function connectController(req, res) {
  const printerId = toInt(req.params.id, null);
  if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

  const { computer } = req.body || {};
  const updated = await connectComputerService(printerId, computer);
  res.json(updated);
}

export async function disconnectController(req, res) {
  const printerId = toInt(req.params.id, null);
  if (!printerId) return res.status(400).json({ error: "Invalid printer id" });

  const { computer } = req.body || {};
  const updated = await disconnectComputerService(printerId, computer);
  res.json(updated);
}
