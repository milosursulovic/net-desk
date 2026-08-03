import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Obrasci imena "virtuelnih"/softverskih štampača (Microsoft Print to PDF,
// AnyDesk Printer, itd.) koje admin ne želi da vidi u analitici/izvozu -
// isti CRUD obrazac kao flagged_domains (dnsLogs.repo.js), substring
// case-insensitive poklapanje.
export async function listIgnoredPrinterPatterns(search) {
  const { where, params } = buildLikeSearch(["pattern"], search);
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      pattern,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM ignored_printer_patterns
    ${where ? `WHERE ${where}` : ""}
    ORDER BY pattern
    `,
    params,
  );
  return rows;
}

export async function findIgnoredPrinterPatternMatch(pattern) {
  const [rows] = await pool.execute(
    `SELECT id FROM ignored_printer_patterns WHERE LOWER(pattern) = LOWER(?) LIMIT 1`,
    [pattern],
  );
  return rows?.[0] || null;
}

export async function insertIgnoredPrinterPattern({ pattern, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO ignored_printer_patterns (pattern, reason, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [pattern, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteIgnoredPrinterPattern(id) {
  const [result] = await pool.execute(`DELETE FROM ignored_printer_patterns WHERE id = ?`, [id]);
  return result.affectedRows;
}
