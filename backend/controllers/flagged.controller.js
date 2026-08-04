import { FlagSoftwareSchema, FlagServiceSchema, FlagDriverSchema } from "../dtos/flagged.dto.js";
import {
  listFlaggedSoftwareService,
  addFlaggedSoftwareService,
  removeFlaggedSoftwareService,
  listFlaggedServicesService,
  addFlaggedServiceService,
  removeFlaggedServiceService,
  listFlaggedDriversService,
  addFlaggedDriverService,
  removeFlaggedDriverService,
} from "../services/flagged.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

export async function listFlaggedSoftwareController(req, res) {
  const search = String(req.query.search || "").trim();
  const items = await listFlaggedSoftwareService(search);
  res.json({ items });
}

export async function createFlaggedSoftwareController(req, res) {
  const parsed = FlagSoftwareSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const created = await addFlaggedSoftwareService(parsed.data, req.user?.userId ?? null);
  res.status(201).json(created);
}

export async function deleteFlaggedSoftwareController(req, res) {
  const id = parseIdParam(req);
  await removeFlaggedSoftwareService(id);
  res.json({ success: true });
}

export async function listFlaggedServicesController(req, res) {
  const search = String(req.query.search || "").trim();
  const items = await listFlaggedServicesService(search);
  res.json({ items });
}

export async function createFlaggedServiceController(req, res) {
  const parsed = FlagServiceSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const created = await addFlaggedServiceService(parsed.data, req.user?.userId ?? null);
  res.status(201).json(created);
}

export async function deleteFlaggedServiceController(req, res) {
  const id = parseIdParam(req);
  await removeFlaggedServiceService(id);
  res.json({ success: true });
}

export async function listFlaggedDriversController(req, res) {
  const search = String(req.query.search || "").trim();
  const items = await listFlaggedDriversService(search);
  res.json({ items });
}

export async function createFlaggedDriverController(req, res) {
  const parsed = FlagDriverSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const created = await addFlaggedDriverService(parsed.data, req.user?.userId ?? null);
  res.status(201).json(created);
}

export async function deleteFlaggedDriverController(req, res) {
  const id = parseIdParam(req);
  await removeFlaggedDriverService(id);
  res.json({ success: true });
}
