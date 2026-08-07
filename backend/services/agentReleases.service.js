import fs from "fs";
import path from "path";
import crypto from "crypto";
import AdmZip from "adm-zip";
import {
  insertRelease,
  insertReleaseGroups,
  setReleaseGroups,
  isReleaseTargetingGroup,
  findReleaseById,
  findActiveReleasesForGroup,
  listReleases,
  setReleaseActive,
  insertReleaseFiles,
  findReleaseFiles,
  findReleaseIdByVersion,
} from "../repositories/agentReleases.repo.js";
import {
  insertUpdateLog,
  listUpdateLogForAgent,
} from "../repositories/agentUpdateLog.repo.js";
import { updateAgentVersion } from "../repositories/agents.repo.js";
import { compareVersions, isNewerVersion } from "../utils/semver.js";
import { paginate } from "../utils/pagination.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { signBuffer, getSigningCertificatePem } from "../utils/agentSigning.js";

const RELEASES_DIR = path.join(process.cwd(), "uploads", "agent-releases");

function ensureReleasesDir() {
  fs.mkdirSync(RELEASES_DIR, { recursive: true });
}

// Read-only uvid u šta je STVARNO na disku (za razliku od listReleasesService
// koje čita agent_releases tabelu) - koristan da se uoči neusklađenost, npr.
// fajl obrisan ručno mimo aplikacije dok baza i dalje misli da postoji, ili
// obrnuto. Namerno bez upload/delete ovde - ta dva moraju ići kroz
// uploadReleaseService/setReleaseActiveService da baza ostane izvor istine.
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
  // Ime fajla na disku više ne uključuje grupu (release sada može ciljati
  // više grupa - agent_release_groups je izvor istine za to, ne slug u imenu).
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

  // Dedup u JS (case-sensitive - "IT" i "it" se tretiraju kao različite
  // grupe, isto kao slobodan tekst svuda drugde u ovoj promeni).
  const uniqueGroups = [...new Set(deploymentGroups.map((g) => g.trim()).filter(Boolean))];
  await insertReleaseGroups(id, uniqueGroups);

  // Manifest fajlova unutar zip-a (ime + veličina) - JEDNOM ovde, iz buffer-a
  // direktno (bez raspakivanja na disk), da checkServiceFilesMismatchService
  // kasnije ima sa čim da poredi ono što agent stvarno prijavi da ima
  // instalirano. Fascikle (isDirectory) se preskaču - zanima nas samo
  // sadržaj fajlova, isto što agent skenira na svojoj strani. Best-effort
  // (try/catch) namerno - upload ne sme da propadne samo zato što manifest
  // nije mogao da se pročita (npr. paket koji nije standardan zip); poređenje
  // kasnije jednostavno nema manifest za taj release i tiho se preskače
  // (isti "nema sa čim da se poredi" put kao release bez uploadovanog manifesta).
  try {
    const zip = new AdmZip(buffer);
    const files = zip
      .getEntries()
      .filter((e) => !e.isDirectory)
      .map((e) => ({ path: e.entryName.replace(/\\/g, "/"), size: e.header.size }));
    await insertReleaseFiles(id, files);
  } catch {
    // Vidi komentar iznad - upload ostaje uspešan bez manifesta.
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

// "rest" is the implicit default deployment group for agents that were never
// assigned one. The same `agent.deploymentGroup || "rest"` fallback is
// duplicated below in downloadReleaseService - both must match or an agent
// could see an update as available but then be refused the download.
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
    signatureCertificatePem: best.signature ? getSigningCertificatePem() : null,
    releaseNotes: best.releaseNotes,
    downloadUrl: `/api/agents/update/download/${best.id}`,
  };
}

// Poredi šta agent PRIJAVI da ima u svom Service folderu (ime + veličina, iz
// InventoryCollector.CollectServiceFiles na C# strani) sa manifestom release-a
// koji odgovara verziji koju agent SAM izveštava (agent.agentVersion) - hvata
// pokvaren/delimičan update (fajlovi ostali stari/nedostaju iako agent misli
// da je na novoj verziji), ne "agent je zastareo" (to je već vidljivo preko
// verzije same). Bez hash-a namerno - ime+veličina je dovoljno za ovu svrhu
// i ne zahteva da agent čita/heš-uje svaki fajl na svakom inventory sync-u.
export async function checkServiceFilesMismatchService(agentVersion, reportedFiles) {
  if (!agentVersion || !Array.isArray(reportedFiles) || !reportedFiles.length) {
    return { mismatch: false, details: null };
  }

  const releaseId = await findReleaseIdByVersion(agentVersion);
  if (!releaseId) {
    // Verzija bez poznatog release-a u bazi (npr. ručno instalirana, ili
    // otpremljena pre nego što je ovaj manifest mehanizam postojao) - nema sa
    // čim da se poredi, ne tretiramo kao neusklađenost.
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
  const targeted = release
    ? await isReleaseTargetingGroup(releaseId, agent.deploymentGroup || "rest")
    : false;
  if (!release || !release.isActive || !targeted) {
    throw notFound("Verzija nije pronađena");
  }

  const filePath = path.join(RELEASES_DIR, release.filePath);
  if (!fs.existsSync(filePath)) {
    throw notFound("Fajl paketa nije pronađen na serveru");
  }

  return { filePath, fileName: release.fileName };
}

// "Širenje" rollout-a - menja SET ciljanih grupa na već otpremljenom
// release-u BEZ ponovnog upload-a paketa. Pun replace (ne append) - frontend
// šalje ceo novi set (stare + nove grupe za širenje).
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

export async function listUpdateLogService(agentId, { page, limit }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listUpdateLogForAgent(agentId, { limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages };
}
