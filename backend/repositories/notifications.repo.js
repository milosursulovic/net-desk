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

export async function countDiskFullAgents(thresholdPct = 90) {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM agent_monitoring WHERE disk_used_pct >= ?`,
    [thresholdPct],
  );
  return Number(cnt) || 0;
}

export async function countAntivirusInactiveAgents() {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM agent_monitoring WHERE antivirus_status = 'disabled'`,
  );
  return Number(cnt) || 0;
}

export async function countFirewallInactiveAgents() {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM agent_monitoring WHERE firewall_status = 'disabled'`,
  );
  return Number(cnt) || 0;
}

export async function countFailedJobsRecent(hours = 24) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_jobs
    WHERE status = 'failed' AND completed_at >= NOW() - INTERVAL ? HOUR
    `,
    [hours],
  );
  return Number(cnt) || 0;
}

export async function countWuServiceUnavailable() {
  const [[{ cnt }]] = await pool.execute(`
    SELECT COUNT(*) AS cnt
    FROM computer_metadata cm
    JOIN ip_entries ie ON ie.id = cm.ip_entry_id
    WHERE ie.entry_type = 'computer'
      AND cm.wu_service_status IS NOT NULL
      AND cm.wu_service_status <> 'Running'
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
