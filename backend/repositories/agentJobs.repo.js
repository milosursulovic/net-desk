import { pool } from "../db/pool.js";
import { CONNECTIVITY_STATUS_SQL } from "./agents.repo.js";

// mysql2 auto-parses `payload` into an object ONLY if the column is a real
// MariaDB JSON type (CHECK (json_valid(...))) - in environments where the column
// is a plain LONGTEXT (the schema was applied by hand per server, without a
// migration tool, so this drifts easily) mysql2 returns the raw JSON string.
// Discovered live: the agent received a string instead of an object for the
// payload and failed deserializing it (Newtonsoft JObject vs JValue). This
// function works correctly in both cases.
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
    agentId: row.agentId,
    batchId: row.batchId,
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
  agent_id AS agentId,
  batch_id AS batchId,
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

export async function insertJob({ agentId, batchId, commandType, payload, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO agent_jobs
      (agent_id, batch_id, command_type, payload, status, created_by_user_id)
    VALUES (?, ?, ?, ?, 'pending', ?)
    `,
    [agentId, batchId ?? null, commandType, payload ? JSON.stringify(payload) : null, createdByUserId],
  );
  return result.insertId;
}

// job_batches.id is a CHAR(36) UUID (crypto.randomUUID(), generated in
// agentJobs.service.js) - one row per batch call, the children are agent_jobs
// rows linked through the batch_id FK. A separate table (not just GROUP BY
// on agent_jobs.batch_id) on purpose - the history list stays a fast indexed
// lookup even as agent_jobs grows.
export async function insertJobBatch({ id, commandType, createdByUserId }) {
  await pool.execute(
    `
    INSERT INTO job_batches (id, command_type, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [id, commandType, createdByUserId],
  );
  return id;
}

// Used by downloadReleaseService (agentReleases.service.js) to allow
// downloading a release that does NOT target the agent's current deployment
// group, if there is a recent EXPLICIT force_reinstall_agent job for exactly
// that agent and exactly that release - the admin knowingly bypassed normal
// group targeting (e.g. installing an older version from the Agent Detail
// page), and that must not be blocked by the same check that protects the
// normal auto-update flow (so an agent can't "guess" someone else's releaseId).
export async function findRecentForceReinstallJob(agentId, releaseId, withinMinutes = 60) {
  const [rows] = await pool.execute(
    `
    SELECT id FROM agent_jobs
    WHERE agent_id = ?
      AND command_type = 'force_reinstall_agent'
      AND JSON_EXTRACT(payload, '$.releaseId') = ?
      AND created_at >= NOW() - INTERVAL ? MINUTE
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [agentId, releaseId, withinMinutes],
  );
  return rows?.[0] || null;
}

export async function findJobBatchById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      id AS batchId,
      command_type AS commandType,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM job_batches
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return rows?.[0] || null;
}

export async function listJobsForBatch(batchId) {
  const [rows] = await pool.execute(
    `
    SELECT
      j.id,
      j.agent_id AS agentId,
      j.batch_id AS batchId,
      j.command_type AS commandType,
      j.payload,
      j.status,
      j.created_by_user_id AS createdByUserId,
      j.exit_code AS exitCode,
      j.output,
      j.error_output AS errorOutput,
      j.duration_ms AS durationMs,
      j.created_at AS createdAt,
      j.sent_at AS sentAt,
      j.completed_at AS completedAt,
      agents.hostname,
      agents.agent_uid AS agentUid,
      (${CONNECTIVITY_STATUS_SQL}) AS connectivityStatus
    FROM agent_jobs j
    JOIN agents ON agents.id = j.agent_id
    WHERE j.batch_id = ?
    ORDER BY agents.hostname ASC
    `,
    [batchId],
  );
  return rows.map((r) => ({
    ...mapRow(r),
    hostname: r.hostname,
    agentUid: r.agentUid,
    // So "pending" items show whether the agent is online at all - a pending
    // command can wait forever if the agent is offline, not just until its
    // turn comes on the next poll cycle.
    connectivityStatus: r.connectivityStatus,
  }));
}

export async function listJobBatches({ limit, offset, onlyUnfinished }) {
  // "Unfinished" = at least one item in the batch is still pending/sent - can't
  // be expressed as a WHERE (status isn't aggregated per batch at that point),
  // so it goes into HAVING after GROUP BY. The same condition is repeated in
  // the count query (wrapped in a subquery) so pagination computes the correct
  // total over the filtered set, not over all batches.
  const having = onlyUnfinished ? "HAVING SUM(j.status IN ('pending', 'sent')) > 0" : "";

  const [[{ total }]] = await pool.execute(
    `
    SELECT COUNT(*) AS total FROM (
      SELECT jb.id
      FROM job_batches jb
      LEFT JOIN agent_jobs j ON j.batch_id = jb.id
      GROUP BY jb.id
      ${having}
    ) t
    `,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      jb.id AS batchId,
      jb.command_type AS commandType,
      jb.created_by_user_id AS createdByUserId,
      jb.created_at AS createdAt,
      COUNT(j.id) AS total,
      SUM(j.status = 'pending') AS pendingCount,
      SUM(j.status = 'sent') AS sentCount,
      SUM(j.status = 'completed') AS completedCount,
      SUM(j.status = 'failed') AS failedCount,
      SUM(j.status = 'cancelled') AS cancelledCount
    FROM job_batches jb
    LEFT JOIN agent_jobs j ON j.batch_id = jb.id
    GROUP BY jb.id
    ${having}
    ORDER BY jb.created_at DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset],
  );

  return {
    items: rows.map((r) => ({
      batchId: r.batchId,
      commandType: r.commandType,
      createdByUserId: r.createdByUserId,
      createdAt: r.createdAt,
      total: Number(r.total) || 0,
      pendingCount: Number(r.pendingCount) || 0,
      sentCount: Number(r.sentCount) || 0,
      completedCount: Number(r.completedCount) || 0,
      failedCount: Number(r.failedCount) || 0,
      cancelledCount: Number(r.cancelledCount) || 0,
    })),
    total: Number(total) || 0,
  };
}

export async function findJobById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM agent_jobs WHERE id = ? LIMIT 1`,
    [id],
  );
  return mapRow(rows?.[0]);
}

export async function findPendingJobsForAgent(agentId) {
  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM agent_jobs
    WHERE agent_id = ? AND status = 'pending'
    ORDER BY created_at ASC
    `,
    [agentId],
  );
  return rows.map(mapRow);
}

// Cancels every command NOT YET in a final state ('pending' or 'sent') - not
// just 'pending'. The agent still has no channel for interrupting mid-execution,
// so an already sent ('sent') command may physically run on the machine even
// after this; cancelling here records the user's intent and prevents a later
// result from overwriting the status - when the agent tries to submit the
// result, submitJobResultService rejects it (completeJob's WHERE status='sent'
// no longer matches), so the status stays 'cancelled'.
export async function cancelActiveJobsInBatch(batchId) {
  const [result] = await pool.execute(
    `
    UPDATE agent_jobs
    SET status = 'cancelled', completed_at = NOW(), error_output = 'Otkazano od strane korisnika'
    WHERE batch_id = ? AND status IN ('pending', 'sent')
    `,
    [batchId],
  );
  return result.affectedRows;
}

// Same rule as cancelActiveJobsInBatch, but for a single command (outside a
// batch context, or one item of a batch) - the Agent Detail "Komande" tab and
// individual items on the Batch Job Detail page.
export async function cancelJob(jobId) {
  const [result] = await pool.execute(
    `
    UPDATE agent_jobs
    SET status = 'cancelled', completed_at = NOW(), error_output = 'Otkazano od strane korisnika'
    WHERE id = ? AND status IN ('pending', 'sent')
    `,
    [jobId],
  );
  return result.affectedRows;
}

export async function markJobsSent(ids) {
  if (!ids.length) return;
  await pool.execute(
    `
    UPDATE agent_jobs
    SET status = 'sent', sent_at = NOW()
    WHERE id IN (${ids.map(() => "?").join(",")})
    `,
    ids,
  );
}

export async function completeJob(id, { status, exitCode, output, errorOutput, durationMs }) {
  const [result] = await pool.execute(
    `
    UPDATE agent_jobs
    SET status = ?, exit_code = ?, output = ?, error_output = ?, duration_ms = ?, completed_at = NOW()
    WHERE id = ? AND status = 'sent'
    `,
    [status, exitCode, output, errorOutput, durationMs, id],
  );
  return result.affectedRows;
}

export async function listFailedJobsSince(since, limit = 20, site) {
  const [rows] = await pool.execute(
    `
    SELECT
      a.hostname,
      j.command_type AS commandType,
      j.error_output AS errorOutput,
      j.completed_at AS completedAt
    FROM agent_jobs j
    JOIN agents a ON a.id = j.agent_id
    ${site ? "JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE j.status = 'failed' AND j.completed_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY j.completed_at DESC
    LIMIT ?
    `,
    [since, ...(site ? [site] : []), limit],
  );
  return rows;
}

export async function countFailedJobsSince(since, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_jobs j
    ${site ? "JOIN agents a ON a.id = j.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE j.status = 'failed' AND j.completed_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    `,
    [since, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

export async function deleteJobsForAgent(agentId) {
  const [result] = await pool.execute(`DELETE FROM agent_jobs WHERE agent_id = ?`, [agentId]);
  return result.affectedRows;
}

export async function listJobsForAgent({ agentId, status, limit, offset }) {
  const whereParts = ["agent_id = ?"];
  const params = [agentId];

  if (["pending", "sent", "completed", "failed", "cancelled"].includes(status)) {
    whereParts.push("status = ?");
    params.push(status);
  }

  const whereSql = `WHERE ${whereParts.join(" AND ")}`;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agent_jobs ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT ${SELECT_FIELDS}
    FROM agent_jobs
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows.map(mapRow), total: Number(total) || 0 };
}
