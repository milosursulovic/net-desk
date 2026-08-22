import multer from "multer";
import {
  CreateReleaseSchema,
  UpdateReportSchema,
  UpdateReleaseGroupsSchema,
} from "../dtos/agentReleases.dto.js";
import {
  uploadReleaseService,
  listReleasesService,
  setReleaseActiveService,
  deleteReleaseService,
  checkForUpdateService,
  downloadReleaseService,
  downloadReleaseForManagerService,
  reportUpdateResultService,
  listUpdateLogService,
  updateReleaseGroupsService,
  listReleaseFilesOnDiskService,
} from "../services/agentReleases.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { toInt, clamp } from "../utils/numbers.js";
import { badRequest } from "../utils/httpError.js";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
}).single("file");

// =========================
// Admin (JWT)
// =========================

export async function createReleaseController(req, res) {
  // multer stavlja ne-file polja iz multipart/form-data kao string - niz
  // grupa stiže kao JSON-encoded string, mora se parsirati PRE Zod validacije.
  let deploymentGroups;
  try {
    deploymentGroups = JSON.parse(req.body?.deploymentGroups || "[]");
  } catch {
    throw badRequest("Neispravan format deployment grupa");
  }

  const parsed = CreateReleaseSchema.safeParse({ ...req.body, deploymentGroups });
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const release = await uploadReleaseService(
    {
      buffer: req.file?.buffer,
      originalName: req.file?.originalname,
      ...parsed.data,
    },
    req.user?.userId ?? null,
  );
  res.status(201).json(release);
}

export async function listReleaseFilesController(req, res) {
  const items = await listReleaseFilesOnDiskService();
  res.json({ items });
}

export async function listReleasesController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);

  const out = await listReleasesService({ page, limit });
  res.json(out);
}

export async function setReleaseActiveController(req, res) {
  const id = parseIdParam(req, "id", "ID verzije");
  const isActive = !!req.body?.isActive;

  const release = await setReleaseActiveService(id, isActive);
  res.json(release);
}

export async function deleteReleaseController(req, res) {
  const id = parseIdParam(req, "id", "ID verzije");

  await deleteReleaseService(id);
  res.status(204).send();
}

export async function updateReleaseGroupsController(req, res) {
  const id = parseIdParam(req, "id", "ID verzije");

  const parsed = UpdateReleaseGroupsSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const release = await updateReleaseGroupsService(id, parsed.data.deploymentGroups);
  res.json(release);
}

export async function listUpdateLogController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);

  const out = await listUpdateLogService(id, { page, limit });
  res.json(out);
}

// =========================
// Agent (agent auth)
// =========================

export async function checkUpdateController(req, res) {
  const out = await checkForUpdateService(req.agent);
  res.json(out);
}

export async function downloadUpdateController(req, res) {
  const releaseId = parseIdParam(req, "releaseId", "ID verzije");

  const { filePath, fileName } = await downloadReleaseService(releaseId, req.agent);
  res.download(filePath, fileName);
}

// Manager (manager auth) — /api/managers/update/download/:releaseId

export async function downloadUpdateForManagerController(req, res) {
  const releaseId = parseIdParam(req, "releaseId", "ID verzije");

  const { filePath, fileName } = await downloadReleaseForManagerService(releaseId, req.manager);
  res.download(filePath, fileName);
}

export async function reportUpdateController(req, res) {
  const parsed = UpdateReportSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await reportUpdateResultService(req.agent, parsed.data);
  res.json(out);
}
