import {
  ScanSchema,
  ListSchema,
  UpsertIpSchema,
  PendingRepackSchema,
  SITES,
} from "../dtos/ipAddresses.dto.js";
import {
  scanPorts,
  listService,
  filterOptionsService,
  getByIdService,
  createService,
  updateService,
  deleteService,
  duplicatesService,
  exportXlsxRowsService,
  setPendingRepackService,
} from "../services/ipAddresses.service.js";
import { getUptimeHistory } from "../services/ipStatusHistory.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { sendXlsxExport } from "../utils/exportExcel.js";
import { badRequest } from "../utils/httpError.js";

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function scanPortsController(req, res) {
  const q = ScanSchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues });

  const out = await scanPorts(q.data);
  res.json(out);
}

export async function duplicatesController(req, res) {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");
  const out = await duplicatesService({
    search: parsed.data.search,
    status: parsed.data.status,
    site: parsed.data.site,
  });
  res.json(out);
}

export async function exportXlsxController(req, res) {
  const search = String(req.query.search || "");
  const rows = await exportXlsxRowsService(search, siteFilter(req.query.site));

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
          { header: "entryType", key: "entryType", width: 14 },
          { header: "remoteScript", key: "remoteScript", width: 20 },
          { header: "description", key: "description", width: 24 },
        ],
        rows,
      },
    ],
  });
}

export async function filterOptionsController(req, res) {
  const out = await filterOptionsService(siteFilter(req.query.site));
  res.json(out);
}

export async function listController(req, res) {
  const parsed = ListSchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");
  const out = await listService(parsed.data);
  res.json(out);
}

export async function getByIdController(req, res) {
  const id = parseIdParam(req);
  const out = await getByIdService(id);
  res.json(out);
}

export async function uptimeHistoryController(req, res) {
  const id = parseIdParam(req);
  const out = await getUptimeHistory(id);
  res.json(out);
}

export async function createController(req, res) {
  const parsed = UpsertIpSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Neispravan format podataka");
  const created = await createService(parsed.data);
  res.status(201).json(created);
}

export async function updateController(req, res) {
  const id = parseIdParam(req);
  const parsed = UpsertIpSchema.partial().safeParse(req.body);
  if (!parsed.success) throw badRequest("Neispravan format podataka");
  const updated = await updateService(id, parsed.data);
  res.json(updated);
}

export async function deleteController(req, res) {
  const id = parseIdParam(req);
  await deleteService(id);
  res.json({ message: "Unos obrisan" });
}

export async function setPendingRepackController(req, res) {
  const id = parseIdParam(req);
  const parsed = PendingRepackSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const updated = await setPendingRepackService(id, parsed.data.pendingRepack);
  res.json(updated);
}
