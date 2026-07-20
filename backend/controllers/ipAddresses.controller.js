import {
  ScanSchema,
  ListSchema,
  UpsertIpSchema,
} from "../dtos/ipAddresses.dto.js";
import {
  scanPorts,
  listService,
  getByIdService,
  createService,
  updateService,
  deleteService,
  duplicatesService,
  exportXlsxRowsService,
} from "../services/ipAddresses.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { sendXlsxExport } from "../utils/exportExcel.js";

export async function scanPortsController(req, res) {
  const q = ScanSchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues });

  const out = await scanPorts(q.data);
  res.json(out);
}

export async function duplicatesController(req, res) {
  const parsed = ListSchema.parse(req.query);
  const out = await duplicatesService({
    search: parsed.search,
    status: parsed.status,
  });
  res.json(out);
}

export async function exportXlsxController(req, res) {
  const search = String(req.query.search || "");
  const rows = await exportXlsxRowsService(search);

  await sendXlsxExport(res, {
    filename: "ip-entries.xlsx",
    sheets: [
      {
        name: "IP-Entries",
        columns: [
          { header: "ip", key: "ip", width: 14 },
          { header: "computerName", key: "computerName", width: 20 },
          { header: "rdpApp", key: "rdpApp", width: 18 },
          { header: "os", key: "os", width: 22 },
          { header: "department", key: "department", width: 16 },
          { header: "remoteScript", key: "remoteScript", width: 20 },
          { header: "hasMetadata", key: "hasMetadata", width: 14 },
          { header: "description", key: "description", width: 24 },
        ],
        rows,
      },
    ],
  });
}

export async function listController(req, res) {
  const parsed = ListSchema.parse(req.query);
  const out = await listService(parsed);
  res.json(out);
}

export async function getByIdController(req, res) {
  const id = parseIdParam(req);
  const out = await getByIdService(id);
  res.json(out);
}

export async function createController(req, res) {
  const parsed = UpsertIpSchema.parse(req.body);
  const created = await createService(parsed);
  res.status(201).json(created);
}

export async function updateController(req, res) {
  const id = parseIdParam(req);
  const parsed = UpsertIpSchema.partial().parse(req.body);
  const updated = await updateService(id, parsed);
  res.json(updated);
}

export async function deleteController(req, res) {
  const id = parseIdParam(req);
  await deleteService(id);
  res.json({ message: "Unos obrisan" });
}
