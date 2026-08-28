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

// Napomene se, za razliku od ostalih polja upload-a (verzija, fajl, sha256),
// mogu naknadno dopuniti/ispraviti - nema poslovnog razloga da ostanu
// zaključane posle upload-a kao ostatak reda (koji je vezan za sam fajl).
export async function updateReleaseNotesService(id, releaseNotes) {
  const affected = await updateReleaseNotes(id, releaseNotes ?? null);
  if (!affected) {
    throw notFound("Verzija nije pronađena");
  }
  return await findReleaseById(id);
}

// Namerno SAMO za deaktivirane release-e - brisanje aktivne verzije bi
// moglo da obori auto-update za agente koji je trenutno ciljaju (isti
// razlog kao zašto se najpre traži eksplicitna deaktivacija, ne jedan
// nepovratan korak). agent_release_groups/agent_release_files se čiste
// automatski preko ON DELETE CASCADE (migracije 0006/0003) - ne moraju
// posebno da se brišu ovde. Fizički fajl na disku se briše best-effort
// (ne obara ceo zahtev ako fajl već ne postoji/ručno obrisan mimo baze).
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
    // Fajl već ne postoji ili je ručno obrisan - baza je posle DELETE-a
    // iznad ionako izvor istine, ovo je samo best-effort čišćenje diska.
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
  const groups = agent.deploymentGroups?.length ? agent.deploymentGroups : ["rest"];
  const targeted = release ? await isReleaseTargetingAnyGroup(releaseId, groups) : false;
  // Ako release ne cilja agentovu grupu (normalan slučaj za auto-update),
  // ipak dozvoli preuzimanje kad postoji skorašnji, eksplicitan
  // force_reinstall_agent job baš za ovog agenta i baš ovaj release - admin
  // je svesno zaobišao grupno ciljanje (npr. "Instaliraj određenu verziju"
  // na Agent Detail strani), ne sme se blokirati istom zaštitom koja
  // sprečava agenta da sam "pogodi" releaseId van svoje grupe.
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

// Manager nema deployment grupe (nije Agent koncept) - jedini put ovde je
// eksplicitan, admin-pokrenut install_update manager_jobs red za baš ovaj
// releaseId. Bez fallback grupe ("rest") kao kod downloadReleaseService -
// Manager instalacije su UVEK eksplicitne, nikad "auto-detektuj šta mi
// treba" (vidi plan §"Scope decisions").
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

// Manager (managers.repo.js) je povezan preko istog ip_entry_id kao agent,
// ne agent_id direktno - Manager i Agent nemaju direktnu vezu, samo dele
// mašinu (isti obrazac kao getAgentManagerStatusController). Rezultat je
// oblikovan da liči na agent_update_log red (fromVersion/toVersion/success/
// reason/reportedAt), plus channel:'manager' za razlikovanje u UI-u.
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

// Spaja DVA odvojena izvora - agent_update_log (stari put, agent sam sebe
// javlja preko POST /api/agents/update/report) i manager_jobs install_update
// poslove (novi, JEDINI put od kad je force-install po agentu uklonjen -
// vidi ManagerWorker.cs InstallUpdateFromServerAsync, koji NAMERNO ostavlja
// ServerBaseUrl prazan pa ReportResultIfConfiguredAsync nikad ne piše u
// agent_update_log). Bez ovog spajanja, Update log tab bi ostao trajno prazan
// za svaki update urađen preko Manager-a - uživo potvrđeno: agent_update_log
// poslednji red 2026-08-22 pre nego što je Manager kanal preuzeo instalacije,
// manager_jobs ima stvarne install_update redove posle tog trenutka.
//
// Pravo cross-source pagination nije vredno komplikacije za ovu tabelu (po
// agentu, retko više od par desetina pokušaja ukupno) - umesto toga, uzima se
// do `limit` redova iz SVAKOG izvora, spaja, sortira po vremenu, i seče na
// `limit`. `total`/`totalPages` su najbolja procena (zbir oba izvora), ne
// tačna cross-source vrednost - dovoljno za "ima još/nema još" osećaj bez
// tačne stranice N.
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
