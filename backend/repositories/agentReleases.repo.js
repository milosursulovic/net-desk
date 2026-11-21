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

// deployment_group (scalar) is a legacy column - releases now target groups
// through agent_release_groups (many-to-many), so it's no longer selected/written here.
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

// Manifest of the files inside the release ZIP (name + size), filled ONCE
// at upload time (uploadReleaseService reads the zip via adm-zip before
// writing it to disk) - used to compare against what the agent actually
// reports having in its Service folder (checkServiceFilesMismatchService).
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

// Several releases can share the same version string (e.g. a re-upload) -
// the most recently uploaded one wins, same pattern as "best" in
// checkForUpdateService.
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

// Full replace of the targeted group set - DELETE then bulk INSERT, same pattern
// as the "full replace" sync functions in pdsu.service.js. The frontend sends the
// WHOLE new set (old + added groups to widen, or a smaller set to narrow).
export async function setReleaseGroups(releaseId, groups) {
  await pool.execute(`DELETE FROM agent_release_groups WHERE release_id = ?`, [releaseId]);
  await insertReleaseGroups(releaseId, groups);
}

// An agent can now have SEVERAL deployment groups - it matches if ANY of
// them is targeted by this release (IN, not =).
export async function isReleaseTargetingAnyGroup(releaseId, deploymentGroups) {
  if (!deploymentGroups?.length) return false;
  const placeholders = deploymentGroups.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `SELECT 1 FROM agent_release_groups WHERE release_id = ? AND deployment_group IN (${placeholders}) LIMIT 1`,
    [releaseId, ...deploymentGroups],
  );
  return rows.length > 0;
}

// Collects deploymentGroups (array) for the given set of releases in ONE
// extra query (not N+1 per row) and returns a map releaseId -> string[].
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

// An agent can now have SEVERAL deployment groups - returns the releases that
// target ANY of them (IN, not =). DISTINCT because the same release can match
// through more than one of the agent's groups.
export async function findActiveReleasesForGroups(deploymentGroups) {
  if (!deploymentGroups?.length) return [];
  const placeholders = deploymentGroups.map(() => "?").join(",");
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
    WHERE g.deployment_group IN (${placeholders}) AND r.is_active = 1
    ORDER BY r.created_at DESC
    `,
    deploymentGroups,
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

// Notes are deliberately editable AFTER upload too - see UpdateReleaseNotesSchema.
export async function updateReleaseNotes(id, releaseNotes) {
  const [result] = await pool.execute(
    `UPDATE agent_releases SET release_notes = ? WHERE id = ?`,
    [releaseNotes, id],
  );
  return result.affectedRows;
}

// agent_release_groups/agent_release_files have ON DELETE CASCADE on
// release_id - they delete themselves, no separate DELETE needed here.
export async function deleteRelease(id) {
  const [result] = await pool.execute(`DELETE FROM agent_releases WHERE id = ?`, [id]);
  return result.affectedRows;
}

// Releases aren't tied to a site, so there's no site-scope parameter here (unlike
// agents.repo.js's listDistinctAgentOs and similar).
export async function listDistinctReleaseDeploymentGroups() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT deployment_group FROM agent_release_groups ORDER BY deployment_group`,
  );
  return rows.map((r) => r.deployment_group);
}
