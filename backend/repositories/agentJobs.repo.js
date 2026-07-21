import { pool } from "../db/pool.js";

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

export async function insertJob({ agentId, commandType, payload, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO agent_jobs
      (agent_id, command_type, payload, status, created_by_user_id)
    VALUES (?, ?, ?, 'pending', ?)
    `,
    [agentId, commandType, payload ? JSON.stringify(payload) : null, createdByUserId],
  );
  return result.insertId;
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

export async function listJobsForAgent({ agentId, status, limit, offset }) {
  const whereParts = ["agent_id = ?"];
  const params = [agentId];

  if (status === "pending" || status === "sent" || status === "completed" || status === "failed") {
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
