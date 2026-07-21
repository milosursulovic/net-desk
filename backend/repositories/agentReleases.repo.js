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
  deployment_group AS deploymentGroup,
  is_active AS isActive,
  created_by_user_id AS createdByUserId,
  created_at AS createdAt
`;

export async function insertRelease({
  version,
  fileName,
  filePath,
  fileSize,
  sha256,
  signature,
  releaseNotes,
  deploymentGroup,
  createdByUserId,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO agent_releases
      (version, file_name, file_path, file_size, sha256, signature, release_notes, deployment_group, is_active, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `,
    [
      version,
      fileName,
      filePath,
      fileSize,
      sha256,
      signature ?? null,
      releaseNotes,
      deploymentGroup,
      createdByUserId,
    ],
  );
  return result.insertId;
}

export async function findReleaseById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM agent_releases WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows?.[0] || null;
}

export async function findActiveReleasesForGroup(deploymentGroup) {
  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM agent_releases
    WHERE deployment_group = ? AND is_active = 1
    ORDER BY created_at DESC
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

  return { items: rows, total: Number(total) || 0 };
}

export async function setReleaseActive(id, isActive) {
  const [result] = await pool.execute(
    `UPDATE agent_releases SET is_active = ? WHERE id = ?`,
    [isActive ? 1 : 0, id],
  );
  return result.affectedRows;
}
