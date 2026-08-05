import { pool } from "../db/pool.js";
import { CONNECTIVITY_STATUS_SQL } from "./agents.repo.js";

// mysql2 auto-parsira `payload` u objekat SAMO ako je kolona pravi MariaDB
// JSON tip (CHECK (json_valid(...))) - na okruženjima gde je kolona obična
// LONGTEXT (šema se primenjuje ručno po serveru, bez migracionog alata, pa
// se ovo lako razmimoiđe) mysql2 vraća sirov JSON string. Otkriveno uživo:
// agent je dobijao string umesto objekta za payload i padao na
// deserijalizaciji (Newtonsoft JObject vs JValue). Ova funkcija radi
// ispravno u oba slučaja.
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

// job_batches.id je CHAR(36) UUID (crypto.randomUUID(), generisan u
// agentJobs.service.js) - jedan red po batch pozivu, deca su agent_jobs
// redovi povezani preko batch_id FK-a. Odvojena tabela (ne samo GROUP BY
// po agent_jobs.batch_id) namerno - lista istorije ostaje brz indeksovan
// lookup i kad agent_jobs naraste.
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
    // Da se na "na čekanju" stavkama vidi da li je agent uopšte online -
    // pending komanda može čekati zauvek ako je agent offline, ne samo dok
    // dođe na red na sledećem poll ciklusu.
    connectivityStatus: r.connectivityStatus,
  }));
}

export async function listJobBatches({ limit, offset, onlyUnfinished }) {
  // "Unfinished" = bar jedna stavka u batch-u je jos pending/sent - ne
  // moze se izraziti kao WHERE (status jos nije agregiran po batch-u u tom
  // trenutku), pa ide kao HAVING nakon GROUP BY. Isti uslov se ponavlja u
  // count upitu (obavijen u podupit) da paginacija racuna tacan total nad
  // filtriranim skupom, ne nad svim batch-evima.
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

// Otkazuje samo komande koje agent JOŠ NIJE pokupio (status='pending') -
// već poslate ('sent') komande se ne mogu prekinuti (agent nema kanal za
// prekid u toku izvršavanja, samo poll za nove poslove), pa ostaju kako jesu.
export async function cancelPendingJobsInBatch(batchId) {
  const [result] = await pool.execute(
    `
    UPDATE agent_jobs
    SET status = 'cancelled', completed_at = NOW(), error_output = 'Otkazano od strane korisnika'
    WHERE batch_id = ? AND status = 'pending'
    `,
    [batchId],
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
