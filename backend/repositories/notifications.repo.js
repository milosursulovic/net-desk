import { pool } from "../db/pool.js";

export async function countOfflineEntries() {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries WHERE is_online = 0`,
  );
  return Number(cnt) || 0;
}

export async function countDuplicateNameGroups() {
  const [[{ cnt }]] = await pool.execute(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT LOWER(TRIM(computer_name)) AS compKey
      FROM ip_entries
      WHERE TRIM(COALESCE(computer_name,'')) <> ''
      GROUP BY compKey
      HAVING COUNT(*) > 1
    ) dupes
  `);
  return Number(cnt) || 0;
}

export async function countUnclassifiedEntries() {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries WHERE entry_type IS NULL`,
  );
  return Number(cnt) || 0;
}

export async function countAutomaticStoppedServices() {
  const [[{ cnt }]] = await pool.execute(`
    SELECT COUNT(*) AS cnt
    FROM computer_services cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer'
      AND LOWER(TRIM(cs.start_mode)) IN ('auto', 'automatic')
      AND LOWER(TRIM(cs.state)) <> 'running'
  `);
  return Number(cnt) || 0;
}

export async function countStaleUpdateComputers(staleDays = 90) {
  const safeDays = Math.max(1, Math.min(Number(staleDays) || 90, 3650));

  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT ip.id, MAX(cu.installed_on) AS latestUpdate
      FROM ip_entries ip
      LEFT JOIN computer_updates cu ON cu.ip_entry_id = ip.id
      WHERE ip.entry_type = 'computer'
      GROUP BY ip.id
      HAVING latestUpdate IS NULL OR latestUpdate < CURDATE() - INTERVAL ? DAY
    ) stale
    `,
    [safeDays],
  );
  return Number(cnt) || 0;
}
