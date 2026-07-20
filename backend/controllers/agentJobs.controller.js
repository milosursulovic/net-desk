import {
  CreateJobSchema,
  JobResultSchema,
  JobListQuerySchema,
} from "../dtos/agentJobs.dto.js";
import {
  createJobService,
  listJobsForAgentService,
  pollJobsService,
  submitJobResultService,
} from "../services/agentJobs.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

// Admin (JWT) — /api/protected/agents/:id/jobs

export async function createJobController(req, res) {
  const agentId = parseIdParam(req, "id", "ID agenta");

  const parsed = CreateJobSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const job = await createJobService(agentId, parsed.data, req.user?.userId ?? null);
  res.status(201).json(job);
}

export async function listJobsController(req, res) {
  const agentId = parseIdParam(req, "id", "ID agenta");

  const parsed = JobListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await listJobsForAgentService(agentId, parsed.data);
  res.json(out);
}

// Agent (agent auth) — /api/agents/jobs

export async function pollJobsController(req, res) {
  const jobs = await pollJobsService(req.agent.id);
  res.json({ jobs });
}

export async function submitJobResultController(req, res) {
  const jobId = parseIdParam(req, "jobId", "ID zadatka");

  const parsed = JobResultSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const job = await submitJobResultService(req.agent.id, jobId, parsed.data);
  res.json(job);
}
