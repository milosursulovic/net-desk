import { toInt, clamp } from "../utils/numbers.js";
import { parseSearchTerm } from "../utils/queryCoercion.js";
import { parseIdParam } from "../utils/idParam.js";
import { sendXlsxExport } from "../utils/exportExcel.js";
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

export async function exportXlsxPrintersController(req, res) {
  const search = parseSearchTerm(req.query.search);
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
      name: p.name || "",
      manufacturer: p.manufacturer || "",
      model: p.model || "",
      serial: p.serial || "",
      department: p.department || "",
      connectionType: p.connectionType || "",
      ip: p.ip || "",
      shared: !!p.shared,
      hostComputerName: p.hostComputerName || "",
      hostIp: p.hostIp || "",
      connectedCount: extra.connectedCount,
      connectedList: extra.connectedList,
      updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : "",
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : "",
    };
  });

  const dateStamp = new Date().toISOString().slice(0, 10);

  await sendXlsxExport(res, {
    filename: `NetDesk_Printers_${dateStamp}.xlsx`,
    sheets: [
      {
        name: "Printers",
        columns: [
          { header: "Name", key: "name", width: 22 },
          { header: "Manufacturer", key: "manufacturer", width: 18 },
          { header: "Model", key: "model", width: 20 },
          { header: "Serial", key: "serial", width: 18 },
          { header: "Department", key: "department", width: 18 },
          { header: "ConnectionType", key: "connectionType", width: 16 },
          { header: "IP", key: "ip", width: 14 },
          { header: "Shared", key: "shared", width: 10 },
          { header: "Host_ComputerName", key: "hostComputerName", width: 20 },
          { header: "Host_IP", key: "hostIp", width: 14 },
          { header: "ConnectedCount", key: "connectedCount", width: 14 },
          { header: "ConnectedList", key: "connectedList", width: 40 },
          { header: "UpdatedAt", key: "updatedAt", width: 22 },
          { header: "CreatedAt", key: "createdAt", width: 22 },
        ],
        rows: printerRows,
      },
      {
        name: "Connections",
        columns: [
          { header: "PrinterName", key: "PrinterName", width: 22 },
          { header: "PrinterIP", key: "PrinterIP", width: 14 },
          { header: "Role", key: "Role", width: 12 },
          { header: "ComputerName", key: "ComputerName", width: 20 },
          { header: "ComputerIP", key: "ComputerIP", width: 14 },
          { header: "Department", key: "Department", width: 18 },
        ],
        rows: connections,
      },
    ],
  });
}

export async function listPrintersController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 1000);
  const search = parseSearchTerm(req.query.search);
  const out = await listPrintersService({ page, limit, search });
  res.json(out);
}

export async function getPrinterController(req, res) {
  const id = parseIdParam(req, "id", "printer id");
  const out = await getPrinterService(id);
  res.json(out);
}

export async function createPrinterController(req, res) {
  const created = await createPrinterService(req.body || {});
  res.status(201).json(created);
}

export async function updatePrinterController(req, res) {
  const id = parseIdParam(req, "id", "printer id");
  const updated = await updatePrinterService(id, req.body || {});
  res.json(updated);
}

export async function deletePrinterController(req, res) {
  const id = parseIdParam(req, "id", "printer id");
  await deletePrinterService(id);
  res.json({ message: "Printer deleted" });
}

export async function setHostController(req, res) {
  const printerId = parseIdParam(req, "id", "printer id");
  const { computer } = req.body || {};
  const updated = await setHostService(printerId, computer);
  res.json(updated);
}

export async function unsetHostController(req, res) {
  const printerId = parseIdParam(req, "id", "printer id");
  const updated = await unsetHostService(printerId);
  res.json(updated);
}

export async function connectController(req, res) {
  const printerId = parseIdParam(req, "id", "printer id");
  const { computer } = req.body || {};
  const updated = await connectComputerService(printerId, computer);
  res.json(updated);
}

export async function disconnectController(req, res) {
  const printerId = parseIdParam(req, "id", "printer id");
  const { computer } = req.body || {};
  const updated = await disconnectComputerService(printerId, computer);
  res.json(updated);
}
