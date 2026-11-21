import fs from "fs";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import {
  insertRelease,
  insertReleaseGroups,
  setReleaseGroups,
  isReleaseTargetingAnyGroup,
  findReleaseById,
  findActiveReleasesForGroups,
  listReleases,
  setReleaseActive,
  updateReleaseNotes,
  deleteRelease,
  insertReleaseFiles,
  findReleaseFiles,
  findReleaseIdByVersion,
} from "../repositories/agentReleases.repo.js";
import { findRecentForceReinstallJob } from "../repositories/agentJobs.repo.js";
import { findRecentInstallUpdateJob, listJobsForManager } from "../repositories/managerJobs.repo.js";
import { findManagerByIpEntryId } from "../repositories/managers.repo.js";
import {
  insertUpdateLog,
  listUpdateLogForAgent,
} from "../repositories/agentUpdateLog.repo.js";
import { updateAgentVersion, findAgentById } from "../repositories/agents.repo.js";
import { compareVersions, isNewerVersion } from "../utils/semver.js";
import { paginate } from "../utils/pagination.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { signBuffer, getSigningCertificatePem } from "../utils/agentSigning.js";

const RELEASES_DIR = path.join(process.cwd(), "uploads", "agent-releases");

function ensureReleasesDir() {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

// Read-only view of what is ACTUALLY on disk (unlike listReleasesService,
// which reads the agent_releases table) - useful for spotting drift, e.g. a
// file deleted by hand outside the app while the DB still thinks it exists, or
// the other way around. Deliberately no upload/delete here - those two must go through
// uploadReleaseService/setReleaseActiveService so the DB stays the source of truth.
export async function listReleaseFilesOnDiskService() {
  ensureReleasesDir();

  const entries = fs.readdirSync(RELEASES_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const stat = fs.statSync(path.join(RELEASES_DIR, e.name));
      return { name: e.name, size: stat.size, modifiedAt: stat.mtime };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function uploadReleaseService(
  { buffer, originalName, version, deploymentGroups, releaseNotes },
  createdByUserId,
) {
  if (!buffer || !buffer.length) {
    throw badRequest("Fajl paketa je obavezan");
  }

  ensureReleasesDir();

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  const safeExt = path.extname(originalName || "") || ".zip";
  // The filename on disk no longer includes the group (a release can now target
  // several groups - agent_release_groups is the source of truth for that, not a slug in the name).
  const storedFileName = `${version}-${Date.now()}${safeExt}`;
  const filePath = path.join(RELEASES_DIR, storedFileName);

  fs.writeFileSync(filePath, buffer);

  const signature = signBuffer(buffer);

  const id = await insertRelease({
    version,
    fileName: originalName || storedFileName,
    filePath: storedFileName,
    fileSize: buffer.length,
    sha256,
    signature,
    releaseNotes: releaseNotes ?? null,
    createdByUserId,
  });

  // Dedup in JS (case-sensitive - "IT" and "it" are treated as different
  // groups, same as free text everywhere else in this change).
  const uniqueGroups = [...new Set(deploymentGroups.map((g) => g.trim()).filter(Boolean))];
  await insertReleaseGroups(id, uniqueGroups);

  // Manifest of the files inside the zip (name + size) - ONCE here, straight from the
  // buffer (without extracting to disk), so checkServiceFilesMismatchService
  // later has something to compare against what the agent actually reports having
  // installed. Folders (isDirectory) are skipped - we only care about
  // file contents, the same thing the agent scans on its side. Best-effort
  // (try/catch) on purpose - the upload must not fail just because the manifest
  // couldn't be read (e.g. a package that isn't a standard zip); the comparison
  // later simply has no manifest for that release and is silently skipped
  // (the same "nothing to compare against" path as a release without an uploaded manifest).
  try {
    const zip = new AdmZip(buffer);
    const files = zip
      .getEntries()
      .filter((e) => !e.isDirectory)
      .map((e) => ({ path: e.entryName.replace(/\\/g, "/"), size: e.header.size }));
    await insertReleaseFiles(id, files);
  } catch {
    // See the comment above - the upload still succeeds without a manifest.
  }

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

// Notes, unlike the other upload fields (version, file, sha256),
// can be amended/corrected later - there's no business reason for them to stay
// locked after upload like the rest of the row (which is tied to the file itself).
export async function updateReleaseNotesService(id, releaseNotes) {
  const affected = await updateReleaseNotes(id, releaseNotes ?? null);
  if (!affected) {
    throw notFound("Verzija nije pronađena");
  }
  return await findReleaseById(id);
}

// Deliberately ONLY for deactivated releases - deleting an active version could
// break auto-update for agents currently targeting it (the same
// reason an explicit deactivation is required first, not one
// irreversible step). agent_release_groups/agent_release_files are cleaned up
// automatically via ON DELETE CASCADE (migrations 0006/0003) - they don't need
// to be deleted separately here. The physical file on disk is deleted best-effort
// (doesn't fail the whole request if the file is already gone/deleted by hand outside the DB).
export async function deleteReleaseService(id) {
  const release = await findReleaseById(id);
  if (!release) {
    throw notFound("Verzija nije pronađena");
  }
  if (release.isActive) {
    throw badRequest("Ne može se obrisati aktivna verzija - prvo je deaktiviraj");
  }

  await deleteRelease(id);

  try {
    fs.unlinkSync(path.join(RELEASES_DIR, release.filePath));
  } catch {
    // The file no longer exists or was deleted by hand - after the DELETE
    // above the DB is the source of truth anyway, this is just best-effort disk cleanup.
  }
}

// "rest" is the implicit default deployment group for agents with none
// assigned. The same `agent.deploymentGroups?.length ? ... : ["rest"]`
// fallback is duplicated below in downloadReleaseService - both must match
// or an agent could see an update as available but then be refused the
// download. Agent can have MULTIPLE deployment groups now - matches if ANY
// of them is targeted by the release.
export async function checkForUpdateService(agent) {
  const groups = agent.deploymentGroups?.length ? agent.deploymentGroups : ["rest"];
  const candidates = await findActiveReleasesForGroups(groups);
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
    signatureCertificatePem: best.signature ? getSigningCertificatePem() : null,
    releaseNotes: best.releaseNotes,
    downloadUrl: `/api/agents/update/download/${best.id}`,
  };
}

// Compares what the agent REPORTS having in its Service folder (name + size, from
// InventoryCollector.CollectServiceFiles on the C# side) with the manifest of the release
// matching the version the agent ITSELF reports (agent.agentVersion) - catches a
// broken/partial update (files left old/missing even though the agent thinks
// it's on the new version), not "the agent is outdated" (that's already visible from
// the version itself). No hash on purpose - name+size is enough for this purpose
// and doesn't require the agent to read/hash every file on every inventory sync.
export async function checkServiceFilesMismatchService(agentVersion, reportedFiles) {
  if (!agentVersion || !Array.isArray(reportedFiles) || !reportedFiles.length) {
    return { mismatch: false, details: null };
  }

  const releaseId = await findReleaseIdByVersion(agentVersion);
  if (!releaseId) {
    // A version with no known release in the DB (e.g. installed by hand, or
    // uploaded before this manifest mechanism existed) - nothing to
    // compare against, not treated as a mismatch.
    return { mismatch: false, details: null };
  }

  const manifest = await findReleaseFiles(releaseId);
  if (!manifest.length) {
    return { mismatch: false, details: null };
  }

  const reportedByPath = new Map(
    reportedFiles
      .filter((f) => f && f.path)
      .map((f) => [String(f.path).toLowerCase(), Number(f.size)]),
  );

  const problems = [];
  for (const entry of manifest) {
    const key = entry.filePath.toLowerCase();
    if (!reportedByPath.has(key)) {
      problems.push(`nedostaje: ${entry.filePath}`);
    } else if (reportedByPath.get(key) !== Number(entry.fileSize)) {
      problems.push(
        `veličina ne odgovara: ${entry.filePath} (očekivano ${entry.fileSize}, stvarno ${reportedByPath.get(key)})`,
      );
    }
  }

  return {
    mismatch: problems.length > 0,
    details: problems.length ? problems.join("; ") : null,
  };
}

export async function downloadReleaseService(releaseId, agent) {
  const release = await findReleaseById(releaseId);
  const groups = agent.deploymentGroups?.length ? agent.deploymentGroups : ["rest"];
  const targeted = release ? await isReleaseTargetingAnyGroup(releaseId, groups) : false;
  // If the release doesn't target the agent's group (the normal case for auto-update),
  // still allow the download when there's a recent, explicit
  // force_reinstall_agent job for exactly this agent and exactly this release - the admin
  // knowingly bypassed group targeting (e.g. "Install a specific version"
  // on the Agent Detail page), which must not be blocked by the same protection that
  // prevents the agent from "guessing" a releaseId outside its group on its own.
  const forcedJob =
    !targeted && release && agent?.id
      ? await findRecentForceReinstallJob(agent.id, releaseId)
      : null;
  if (!release || !release.isActive || (!targeted && !forcedJob)) {
    throw notFound("Verzija nije pronađena");
  }

  const filePath = path.join(RELEASES_DIR, release.filePath);
  if (!fs.existsSync(filePath)) {
    throw notFound("Fajl paketa nije pronađen na serveru");
  }

  return { filePath, fileName: release.fileName };
}

// The Manager has no deployment groups (not an Agent concept) - the only path here is an
// explicit, admin-triggered install_update manager_jobs row for exactly this
// releaseId. No fallback group ("rest") like downloadReleaseService -
// Manager installs are ALWAYS explicit, never "auto-detect what I
// need" (see the plan §"Scope decisions").
export async function downloadReleaseForManagerService(releaseId, manager) {
  const release = await findReleaseById(releaseId);
  const job = release ? await findRecentInstallUpdateJob(manager.id, releaseId) : null;
  if (!release || !release.isActive || !job) {
    throw notFound("Verzija nije pronađena");
  }

  const filePath = path.join(RELEASES_DIR, release.filePath);
  if (!fs.existsSync(filePath)) {
    throw notFound("Fajl paketa nije pronađen na serveru");
  }

  return { filePath, fileName: release.fileName };
}

// "Widening" a rollout - changes the SET of targeted groups on an already uploaded
// release WITHOUT re-uploading the package. Full replace (not append) - the frontend
// sends the whole new set (old + new groups to widen to).
export async function updateReleaseGroupsService(id, deploymentGroups) {
  const release = await findReleaseById(id);
  if (!release) {
    throw notFound("Verzija nije pronađena");
  }

  const uniqueGroups = [...new Set(deploymentGroups.map((g) => g.trim()).filter(Boolean))];
  if (!uniqueGroups.length) {
    throw badRequest("Bar jedna deployment grupa je obavezna");
  }

  await setReleaseGroups(id, uniqueGroups);
  return await findReleaseById(id);
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

// The Manager (managers.repo.js) is linked via the same ip_entry_id as the agent,
// not agent_id directly - the Manager and the Agent have no direct link, they just share the
// machine (same pattern as getAgentManagerStatusController). The result is
// shaped to resemble an agent_update_log row (fromVersion/toVersion/success/
// reason/reportedAt), plus channel:'manager' to tell them apart in the UI.
async function listManagerInstallLogForAgent(agentId, limit) {
  const agent = await findAgentById(agentId);
  if (!agent?.ipEntryId) return [];

  const manager = await findManagerByIpEntryId(agent.ipEntryId);
  if (!manager) return [];

  const { items: jobs } = await listJobsForManager({ managerId: manager.id, limit, offset: 0 });

  const installJobs = jobs.filter(
    (j) => j.commandType === "install_update" && (j.status === "completed" || j.status === "failed"),
  );

  return Promise.all(
    installJobs.map(async (j) => {
      const releaseId = j.payload?.releaseId;
      const release = releaseId ? await findReleaseById(releaseId) : null;
      return {
        id: "mgr-" + j.id,
        fromVersion: null,
        toVersion: release?.version ?? null,
        success: j.status === "completed",
        reason: j.status === "failed" ? j.errorOutput || "Neuspešno (bez detalja)" : null,
        reportedAt: j.completedAt ?? j.createdAt,
        channel: "manager",
      };
    }),
  );
}

// Merges TWO separate sources - agent_update_log (the old path, the agent reports on itself
// via POST /api/agents/update/report) and manager_jobs install_update
// jobs (the new, ONLY path since per-agent force-install was removed -
// see ManagerWorker.cs InstallUpdateFromServerAsync, which DELIBERATELY leaves
// ServerBaseUrl empty so ReportResultIfConfiguredAsync never writes to
// agent_update_log). Without this merge, the Update log tab would stay permanently empty
// for every update done through the Manager - confirmed live: agent_update_log's
// last row is 2026-08-22, before the Manager channel took over installs,
// manager_jobs has real install_update rows after that point.
//
// Real cross-source pagination isn't worth the complexity for this table (per
// agent, rarely more than a few dozen attempts in total) - instead, it takes
// up to `limit` rows from EACH source, merges them, sorts by time, and cuts to
// `limit`. `total`/`totalPages` are a best estimate (the sum of both sources), not
// an exact cross-source value - enough for a "more/no more" feel without
// an exact page N.
export async function listUpdateLogService(agentId, { page, limit }) {
  const offset = (page - 1) * limit;
  const [{ items: agentItems, total: agentTotal }, managerItems] = await Promise.all([
    listUpdateLogForAgent(agentId, { limit, offset: 0 }),
    listManagerInstallLogForAgent(agentId, limit),
  ]);

  const merged = [...agentItems.map((row) => ({ ...row, channel: "agent" })), ...managerItems]
    .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
    .slice(offset, offset + limit);

  const total = agentTotal + managerItems.length;
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items: merged, page: safePage, limit, total, totalPages };
}
