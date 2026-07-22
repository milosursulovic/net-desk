import { pool } from "../db/pool.js";

export async function insertDailyReport({ periodStart, periodEnd, content }) {
  const [r] = await pool.execute(
    `
    INSERT INTO daily_reports (period_start, period_end, content)
    VALUES (?, ?, ?)
    `,
    [periodStart, periodEnd, JSON.stringify(content)],
  );
  return r.insertId;
}

// mysql2 auto-parses a real MariaDB JSON column (LONGTEXT + json_valid CHECK)
// back into an object, but returns a raw string if the column was ever
// provisioned as plain LONGTEXT without that constraint - normalize both
// shapes defensively (same class of issue as agentJobs.repo.js's payload
// column, see project memory).
function parseContent(row) {
  if (!row) return row;
  const content =
    typeof row.content === "string" ? JSON.parse(row.content) : row.content;
  return { ...row, content };
}

export async function findLatestDailyReport() {
  const [rows] = await pool.execute(
    `
    SELECT id, period_start AS periodStart, period_end AS periodEnd, content,
           opened_at AS openedAt, generated_at AS generatedAt
    FROM daily_reports
    ORDER BY generated_at DESC
    LIMIT 1
    `,
  );
  return parseContent(rows[0]) || null;
}

export async function findDailyReportById(id) {
  const [rows] = await pool.execute(
    `
    SELECT id, period_start AS periodStart, period_end AS periodEnd, content,
           opened_at AS openedAt, generated_at AS generatedAt
    FROM daily_reports
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return parseContent(rows[0]) || null;
}

export async function listDailyReports({ limit, offset }) {
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM daily_reports`,
  );

  const [rows] = await pool.execute(
    `
    SELECT id, period_start AS periodStart, period_end AS periodEnd,
           opened_at AS openedAt, generated_at AS generatedAt
    FROM daily_reports
    ORDER BY generated_at DESC
    LIMIT ? OFFSET ?
    `,
    [limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}

// Only sets opened_at the FIRST time (WHERE opened_at IS NULL) - it marks
// "first read at", not "last viewed at", so re-opening an already-read
// report doesn't move the timestamp forward.
export async function markDailyReportOpened(id) {
  const [r] = await pool.execute(
    `UPDATE daily_reports SET opened_at = NOW() WHERE id = ? AND opened_at IS NULL`,
    [id],
  );
  return r.affectedRows;
}
