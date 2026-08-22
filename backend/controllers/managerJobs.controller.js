import {
  CreateManagerJobSchema,
  ManagerJobResultSchema,
  ManagerJobListQuerySchema,
} from "../dtos/managers.dto.js";
import {
  createManagerJobService,
  pollJobsService,
  submitJobResultService,
  listJobsForManagerService,
  cancelJobService,
} from "../services/managerJobs.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

// Admin (JWT) — /api/protected/managers/:managerId/jobs

export async function createManagerJobController(req, res) {
  const managerId = parseIdParam(req, "managerId", "ID manager-a");

  const parsed = CreateManagerJobSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const job = await createManagerJobService(managerId, parsed.data, req.user?.userId ?? null);
  res.status(201).json(job);
}

export async function listManagerJobsController(req, res) {
  const managerId = parseIdParam(req, "managerId", "ID manager-a");

  const parsed = ManagerJobListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await listJobsForManagerService(managerId, parsed.data);
  res.json(out);
}

export async function cancelManagerJobController(req, res) {
  const jobId = parseIdParam(req, "jobId", "ID zadatka");

  const job = await cancelJobService(jobId);
  res.json(job);
}

// Manager (manager auth) — /api/managers/jobs

export async function pollManagerJobsController(req, res) {
  const jobs = await pollJobsService(req.manager.id);
  res.json({ jobs });
}

export async function submitManagerJobResultController(req, res) {
  const jobId = parseIdParam(req, "jobId", "ID zadatka");

  const parsed = ManagerJobResultSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const job = await submitJobResultService(req.manager.id, jobId, parsed.data);
  res.json(job);
}
