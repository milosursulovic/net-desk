import { pool } from "../db/pool.js";

// Isti razlog kao parsePayload u agentJobs.repo.js - payload kolona može biti
// obična TEXT/LONGTEXT (ne pravi JSON MariaDB tip) na okruženjima gde je šema
// primenjena ručno, pa mysql2 ume da vrati sirov string umesto već-parsiranog
// objekta.
function parsePayload(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    managerId: row.managerId,
    commandType: row.commandType,
    payload: parsePayload(row.payload),
    status: row.status,
    createdByUserId: row.createdByUserId,
    exitCode: row.exitCode,
    output: row.output,
    errorOutput: row.errorOutput,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
    completedAt: row.completedAt,
  };
}

const SELECT_FIELDS = `
  id,
  manager_id AS managerId,
  command_type AS commandType,
  payload,
  status,
  created_by_user_id AS createdByUserId,
  exit_code AS exitCode,
  output,
  error_output AS errorOutput,
  duration_ms AS durationMs,
  created_at AS createdAt,
  sent_at AS sentAt,
  completed_at AS completedAt
`;

export async function insertJob({ managerId, commandType, payload, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO manager_jobs
      (manager_id, command_type, payload, status, created_by_user_id)
    VALUES (?, ?, ?, 'pending', ?)
    `,
    [managerId, commandType, payload ? JSON.stringify(payload) : null, createdByUserId],
  );
  return result.insertId;
}

export async function findJobById(id) {
  const [rows] = await pool.execute(`SELECT ${SELECT_FIELDS} FROM manager_jobs WHERE id = ? LIMIT 1`, [
    id,
  ]);
  return mapRow(rows?.[0]);
}

export async function findPendingJobsForManager(managerId) {
  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM manager_jobs
    WHERE manager_id = ? AND status = 'pending'
    ORDER BY created_at ASC
    `,
    [managerId],
  );
  return rows.map(mapRow);
}

export async function markJobsSent(ids) {
  if (!ids.length) return;
  await pool.execute(
    `
    UPDATE manager_jobs
    SET status = 'sent', sent_at = NOW()
    WHERE id IN (${ids.map(() => "?").join(",")})
    `,
    ids,
  );
}

export async function completeJob(id, { status, exitCode, output, errorOutput, durationMs }) {
  const [result] = await pool.execute(
    `
    UPDATE manager_jobs
    SET status = ?, exit_code = ?, output = ?, error_output = ?, duration_ms = ?, completed_at = NOW()
    WHERE id = ? AND status = 'sent'
    `,
    [status, exitCode, output, errorOutput, durationMs, id],
  );
  return result.affectedRows;
}

export async function cancelJob(jobId) {
  const [result] = await pool.execute(
    `
    UPDATE manager_jobs
    SET status = 'cancelled', completed_at = NOW(), error_output = 'Otkazano od strane korisnika'
    WHERE id = ? AND status IN ('pending', 'sent')
    `,
    [jobId],
  );
  return result.affectedRows;
}

export async function listJobsForManager({ managerId, status, limit, offset }) {
  const whereParts = ["manager_id = ?"];
  const params = [managerId];

  if (["pending", "sent", "completed", "failed", "cancelled"].includes(status)) {
    whereParts.push("status = ?");
    params.push(status);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM manager_jobs ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM manager_jobs
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows.map(mapRow), total: Number(total) || 0 };
}

// Parallel to findRecentForceReinstallJob (agentJobs.repo.js) - gates
// downloadReleaseForManagerService the same way: an admin-dispatched
// install_update job for this exact releaseId is the ONLY authorization
// path for a Manager download (no deployment-group fallback exists for
// Manager, it has no deployment groups at all).
export async function findRecentInstallUpdateJob(managerId, releaseId, withinMinutes = 60) {
  const [rows] = await pool.execute(
    `
    SELECT id FROM manager_jobs
    WHERE manager_id = ?
      AND command_type = 'install_update'
      AND JSON_EXTRACT(payload, '$.releaseId') = ?
      AND created_at >= NOW() - INTERVAL ? MINUTE
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [managerId, releaseId, withinMinutes],
  );
  return rows?.[0] || null;
}
