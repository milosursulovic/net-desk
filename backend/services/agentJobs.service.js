import {
  insertJob,
  findJobById,
  findPendingJobsForAgent,
  markJobsSent,
  completeJob,
  listJobsForAgent,
} from "../repositories/agentJobs.repo.js";
import { findAgentById } from "../repositories/agents.repo.js";
import { paginate } from "../utils/pagination.js";
import { badRequest, notFound, conflict } from "../utils/httpError.js";

export async function createJobService(agentId, dto, createdByUserId) {
  const agent = await findAgentById(agentId);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  if (agent.status !== "active") {
    throw badRequest("Agent nije aktivan");
  }

  const id = await insertJob({
    agentId,
    commandType: dto.commandType,
    payload: dto.payload ?? null,
    createdByUserId,
  });

  return await findJobById(id);
}

// Sequential, not Promise.all - the pool caps at 10 connections
// (db/pool.js), and a batch can target up to 500 agents at once; sequential
// keeps this safely within that limit regardless of fleet size.
export async function createBatchJobService(agentIds, dto, createdByUserId) {
  const uniqueIds = [...new Set(agentIds)];
  const created = [];
  const skipped = [];

  for (const agentId of uniqueIds) {
    const agent = await findAgentById(agentId);
    if (!agent) {
      skipped.push({ agentId, reason: "Agent nije pronađen" });
      continue;
    }
    if (agent.status !== "active") {
      skipped.push({ agentId, hostname: agent.hostname, reason: "Agent nije aktivan" });
      continue;
    }

    const id = await insertJob({
      agentId,
      commandType: dto.commandType,
      payload: dto.payload ?? null,
      createdByUserId,
    });
    created.push({ agentId, hostname: agent.hostname, jobId: id });
  }

  return { created, skipped };
}

export async function listJobsForAgentService(agentId, { page, limit, status }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listJobsForAgent({ agentId, status, limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages, status };
}

export async function pollJobsService(agentId) {
  const jobs = await findPendingJobsForAgent(agentId);
  if (!jobs.length) return [];

  await markJobsSent(jobs.map((j) => j.id));

  const sentAt = new Date();
  return jobs.map((j) => ({ ...j, status: "sent", sentAt }));
}

export async function submitJobResultService(agentId, jobId, dto) {
  const job = await findJobById(jobId);
  if (!job || job.agentId !== agentId) {
    throw notFound("Zadatak nije pronađen");
  }
  if (job.status !== "sent") {
    throw conflict("Zadatak nije u stanju koje očekuje rezultat");
  }

  let status = "completed";
  if (dto.success === false) {
    status = "failed";
  } else if (dto.success === undefined && dto.exitCode != null && dto.exitCode !== 0) {
    status = "failed";
  }

  const affected = await completeJob(jobId, {
    status,
    exitCode: dto.exitCode ?? null,
    output: dto.output ?? null,
    errorOutput: dto.errorOutput ?? null,
    durationMs: dto.durationMs ?? null,
  });

  if (!affected) {
    throw conflict("Zadatak je već obrađen");
  }

  return await findJobById(jobId);
}
