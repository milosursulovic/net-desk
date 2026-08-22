import {
  insertJob,
  findJobById,
  findPendingJobsForManager,
  markJobsSent,
  completeJob,
  listJobsForManager,
  cancelJob,
} from "../repositories/managerJobs.repo.js";
import { findManagerById } from "../repositories/managers.repo.js";
import { findReleaseById } from "../repositories/agentReleases.repo.js";
import { paginate } from "../utils/pagination.js";
import { badRequest, notFound, conflict } from "../utils/httpError.js";

const SERVICE_COMMANDS = new Set(["start_service", "stop_service", "restart_service"]);

export async function createManagerJobService(managerId, dto, createdByUserId) {
  const manager = await findManagerById(managerId);
  if (!manager) {
    throw notFound("Manager nije pronađen");
  }
  if (manager.status !== "active") {
    throw badRequest("Manager nije aktivan");
  }

  let payload = dto.payload ?? null;

  // "servisName" default se popunjava OVDE (server-side), ne u DTO refine-u -
  // najčešći slučaj (kontrola samog NetdeskAgent servisa) tako zahteva nula
  // polja od admina, isto opravdanje kao AgentDetailView.vue-ov postojeći
  // "Nova komanda" default.
  if (SERVICE_COMMANDS.has(dto.commandType) && !payload?.serviceName) {
    payload = { ...payload, serviceName: "NetdeskAgent" };
  }

  if (dto.commandType === "install_update") {
    const release = await findReleaseById(payload.releaseId);
    if (!release) {
      throw badRequest("Izabrana verzija nije pronađena");
    }
    // sha256 se popunjava OVDE (server-side, iz baze), ne oslanja se na ono
    // što je frontend eventualno poslao - Manager mora imati pouzdan hash za
    // proveru preuzetog paketa (InstallUpdateFromServerAsync na C# strani).
    payload = { ...payload, version: release.version, sha256: release.sha256 };
  }

  const id = await insertJob({
    managerId,
    commandType: dto.commandType,
    payload,
    createdByUserId,
  });

  return await findJobById(id);
}

export async function pollJobsService(managerId) {
  const jobs = await findPendingJobsForManager(managerId);
  if (!jobs.length) return [];

  await markJobsSent(jobs.map((j) => j.id));

  const sentAt = new Date();
  return jobs.map((j) => ({ ...j, status: "sent", sentAt }));
}

export async function submitJobResultService(managerId, jobId, dto) {
  const job = await findJobById(jobId);
  if (!job || job.managerId !== managerId) {
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

export async function listJobsForManagerService(managerId, { page, limit, status }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listJobsForManager({ managerId, status, limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages, status };
}

export async function cancelJobService(jobId) {
  const job = await findJobById(jobId);
  if (!job) {
    throw notFound("Zadatak nije pronađen");
  }
  const affected = await cancelJob(jobId);
  if (!affected) {
    throw conflict("Zadatak je već završen i ne može se otkazati");
  }
  return await findJobById(jobId);
}
