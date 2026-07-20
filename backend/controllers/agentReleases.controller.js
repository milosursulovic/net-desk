import multer from "multer";
import {
  CreateReleaseSchema,
  UpdateReportSchema,
  DeploymentGroupSchema,
} from "../dtos/agentReleases.dto.js";
import {
  uploadReleaseService,
  listReleasesService,
  setReleaseActiveService,
  checkForUpdateService,
  downloadReleaseService,
  reportUpdateResultService,
  listUpdateLogService,
} from "../services/agentReleases.service.js";
import { setAgentDeploymentGroupService } from "../services/agents.service.js";
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
  const parsed = CreateReleaseSchema.safeParse(req.body || {});
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

export async function setDeploymentGroupController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");

  const parsed = DeploymentGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const agent = await setAgentDeploymentGroupService(id, parsed.data.deploymentGroup);
  res.json(agent);
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

export async function reportUpdateController(req, res) {
  const parsed = UpdateReportSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await reportUpdateResultService(req.agent, parsed.data);
  res.json(out);
}
