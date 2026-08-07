import { pool } from "../db/pool.js";

const SELECT_FIELDS = `
  id,
  version,
  file_name AS fileName,
  file_path AS filePath,
  file_size AS fileSize,
  sha256,
  signature,
  release_notes AS releaseNotes,
  is_active AS isActive,
  created_by_user_id AS createdByUserId,
  created_at AS createdAt
`;

// deployment_group (skalar) je legacy kolona - releases sada ciljaju grupe
// preko agent_release_groups (many-to-many), pa se više ne bira/piše ovde.
export async function insertRelease({
  version,
  fileName,
  filePath,
  fileSize,
  sha256,
  signature,
  releaseNotes,
  createdByUserId,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO agent_releases
      (version, file_name, file_path, file_size, sha256, signature, release_notes, is_active, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `,
    [version, fileName, filePath, fileSize, sha256, signature ?? null, releaseNotes, createdByUserId],
  );
  return result.insertId;
}

export async function insertReleaseGroups(releaseId, groups) {
  if (!groups.length) return;
  const values = groups.map((g) => [releaseId, g]);
  await pool.query(
    `INSERT INTO agent_release_groups (release_id, deployment_group) VALUES ?`,
    [values],
  );
}

// Manifest fajlova unutar release ZIP-a (ime + veličina), popunjen JEDNOM
// pri upload-u (uploadReleaseService čita zip preko adm-zip pre nego što ga
// upiše na disk) - koristi se da se poredi sa onim što agent stvarno
// prijavi da ima u svom Service folderu (checkServiceFilesMismatchService).
export async function insertReleaseFiles(releaseId, files) {
  if (!files.length) return;
  const values = files.map((f) => [releaseId, f.path, f.size]);
  await pool.query(
    `INSERT INTO agent_release_files (release_id, file_path, file_size) VALUES ?`,
    [values],
  );
}

export async function findReleaseFiles(releaseId) {
  const [rows] = await pool.execute(
    `SELECT file_path AS filePath, file_size AS fileSize FROM agent_release_files WHERE release_id = ?`,
    [releaseId],
  );
  return rows;
}

// Više release-ova može deliti isti version string (npr. ponovni upload) -
// uzima se najskorije otpremljeni, isti obrazac kao "best" u checkForUpdateService.
export async function findReleaseIdByVersion(version) {
  const [rows] = await pool.execute(
    `SELECT id FROM agent_releases WHERE version = ? ORDER BY created_at DESC LIMIT 1`,
    [version],
  );
  return rows?.[0]?.id ?? null;
}

export async function findReleaseGroups(releaseId) {
  const [rows] = await pool.execute(
    `SELECT deployment_group FROM agent_release_groups WHERE release_id = ? ORDER BY deployment_group`,
    [releaseId],
  );
  return rows.map((r) => r.deployment_group);
}

// Pun replace seta ciljanih grupa - DELETE pa bulk INSERT, isti obrazac kao
// "pune zamene" sync funkcija u pdsu.service.js. Frontend šalje CEO novi
// set (stare + dodate grupe za širenje, ili manji set za suženje).
export async function setReleaseGroups(releaseId, groups) {
  await pool.execute(`DELETE FROM agent_release_groups WHERE release_id = ?`, [releaseId]);
  await insertReleaseGroups(releaseId, groups);
}

export async function isReleaseTargetingGroup(releaseId, deploymentGroup) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM agent_release_groups WHERE release_id = ? AND deployment_group = ? LIMIT 1`,
    [releaseId, deploymentGroup],
  );
  return rows.length > 0;
}

// Prikuplja deploymentGroups (niz) za dati skup release-ova u JEDNOM
// dodatnom upitu (ne N+1 po redu) i vraća mapu releaseId -> string[].
async function fetchGroupsByReleaseIds(releaseIds) {
  if (!releaseIds.length) return {};
  const placeholders = releaseIds.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT release_id AS releaseId, deployment_group AS deploymentGroup
     FROM agent_release_groups WHERE release_id IN (${placeholders})
     ORDER BY deployment_group`,
    releaseIds,
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.releaseId]) map[row.releaseId] = [];
    map[row.releaseId].push(row.deploymentGroup);
  }
  return map;
}

export async function findReleaseById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM agent_releases WHERE id = ? LIMIT 1`,
    [id],
  );
  const release = rows?.[0] || null;
  if (!release) return null;
  release.deploymentGroups = await findReleaseGroups(id);
  return release;
}

export async function findActiveReleasesForGroup(deploymentGroup) {
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT
      r.id,
      r.version,
      r.file_name AS fileName,
      r.file_path AS filePath,
      r.file_size AS fileSize,
      r.sha256,
      r.signature,
      r.release_notes AS releaseNotes,
      r.is_active AS isActive,
      r.created_by_user_id AS createdByUserId,
      r.created_at AS createdAt
    FROM agent_releases r
    JOIN agent_release_groups g ON g.release_id = r.id
    WHERE g.deployment_group = ? AND r.is_active = 1
    ORDER BY r.created_at DESC
    `,
    [deploymentGroup],
  );
  return rows;
}

export async function listReleases({ limit, offset }) {
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agent_releases`,
  );

  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM agent_releases
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset],
  );

  const groupsByRelease = await fetchGroupsByReleaseIds(rows.map((r) => r.id));
  const items = rows.map((r) => ({ ...r, deploymentGroups: groupsByRelease[r.id] || [] }));

  return { items, total: Number(total) || 0 };
}

export async function setReleaseActive(id, isActive) {
  const [result] = await pool.execute(
    `UPDATE agent_releases SET is_active = ? WHERE id = ?`,
    [isActive ? 1 : 0, id],
  );
  return result.affectedRows;
}

// Releases nisu site-vezani, pa nema site-scope parametra ovde (za razliku
// od agents.repo.js's listDistinctAgentOs i sličnih).
export async function listDistinctReleaseDeploymentGroups() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT deployment_group FROM agent_release_groups ORDER BY deployment_group`,
  );
  return rows.map((r) => r.deployment_group);
}
