import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  insertRelease,
  findReleaseById,
  findActiveReleasesForGroup,
  listReleases,
  setReleaseActive,
} from "../repositories/agentReleases.repo.js";
import {
  insertUpdateLog,
  listUpdateLogForAgent,
} from "../repositories/agentUpdateLog.repo.js";
import { updateAgentVersion } from "../repositories/agents.repo.js";
import { compareVersions, isNewerVersion } from "../utils/semver.js";
import { paginate } from "../utils/pagination.js";
import { badRequest, notFound } from "../utils/httpError.js";

const RELEASES_DIR = path.join(process.cwd(), "uploads", "agent-releases");

function ensureReleasesDir() {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

export async function uploadReleaseService(
  { buffer, originalName, version, deploymentGroup, releaseNotes },
  createdByUserId,
) {
  if (!buffer || !buffer.length) {
    throw badRequest("Fajl paketa je obavezan");
  }

  ensureReleasesDir();

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const safeExt = path.extname(originalName || "") || ".zip";
  const storedFileName = `${version}-${deploymentGroup}-${Date.now()}${safeExt}`;
  const filePath = path.join(RELEASES_DIR, storedFileName);

  fs.writeFileSync(filePath, buffer);

  const id = await insertRelease({
    version,
    fileName: originalName || storedFileName,
    filePath: storedFileName,
    fileSize: buffer.length,
    sha256,
    releaseNotes: releaseNotes ?? null,
    deploymentGroup,
    createdByUserId,
  });

  return await findReleaseById(id);
}

export async function listReleasesService({ page, limit }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listReleases({ limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages };
}

export async function setReleaseActiveService(id, isActive) {
  const affected = await setReleaseActive(id, isActive);
  if (!affected) {
    throw notFound("Verzija nije pronađena");
  }
  return await findReleaseById(id);
}

export async function checkForUpdateService(agent) {
  const candidates = await findActiveReleasesForGroup(agent.deploymentGroup || "rest");
  if (!candidates.length) return { updateAvailable: false };

  let best = candidates[0];
  for (const c of candidates) {
    if (compareVersions(c.version, best.version) > 0) best = c;
  }

  const currentVersion = agent.agentVersion || "0.0.0";
  if (!isNewerVersion(best.version, currentVersion)) {
    return { updateAvailable: false };
  }

  return {
    updateAvailable: true,
    version: best.version,
    sha256: best.sha256,
    signature: best.signature,
    releaseNotes: best.releaseNotes,
    downloadUrl: `/api/agents/update/download/${best.id}`,
  };
}

export async function downloadReleaseService(releaseId, agent) {
  const release = await findReleaseById(releaseId);
  if (
    !release ||
    !release.isActive ||
    release.deploymentGroup !== (agent.deploymentGroup || "rest")
  ) {
    throw notFound("Verzija nije pronađena");
  }

  const filePath = path.join(RELEASES_DIR, release.filePath);
  if (!fs.existsSync(filePath)) {
    throw notFound("Fajl paketa nije pronađen na serveru");
  }

  return { filePath, fileName: release.fileName };
}

export async function reportUpdateResultService(agent, dto) {
  await insertUpdateLog({
    agentId: agent.id,
    fromVersion: dto.fromVersion ?? null,
    toVersion: dto.toVersion ?? null,
    success: dto.success,
    reason: dto.reason ?? null,
  });

  if (dto.success && dto.toVersion) {
    await updateAgentVersion(agent.id, dto.toVersion);
  }

  return { ok: true };
}

export async function listUpdateLogService(agentId, { page, limit }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listUpdateLogForAgent(agentId, { limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages };
}
