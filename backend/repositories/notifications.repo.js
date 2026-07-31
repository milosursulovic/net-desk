import { pool } from "../db/pool.js";

export async function countOfflineEntries(site) {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries WHERE is_online = 0 ${site ? "AND site = ?" : ""}`,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countDuplicateNameGroups(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt FROM (
      SELECT LOWER(TRIM(computer_name)) AS compKey
      FROM ip_entries
      WHERE TRIM(COALESCE(computer_name,'')) <> ''
        ${site ? "AND site = ?" : ""}
      GROUP BY compKey
      HAVING COUNT(*) > 1
    ) dupes
  `,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countUnclassifiedEntries(site) {
  const [[{ cnt }]] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM ip_entries WHERE entry_type IS NULL ${site ? "AND site = ?" : ""}`,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countAutomaticStoppedServices(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM computer_services cs
    JOIN ip_entries ie ON ie.id = cs.ip_entry_id
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
      AND LOWER(TRIM(cs.start_mode)) IN ('auto', 'automatic')
      AND LOWER(TRIM(cs.state)) <> 'running'
  `,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countDiskFullAgents(thresholdPct = 90, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_monitoring am
    ${site ? "JOIN agents a ON a.id = am.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE am.disk_used_pct >= ?
      ${site ? "AND ie.site = ?" : ""}
    `,
    [thresholdPct, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

export async function countAntivirusInactiveAgents(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_monitoring am
    ${site ? "JOIN agents a ON a.id = am.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE am.antivirus_status = 'disabled'
      ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countFirewallInactiveAgents(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_monitoring am
    ${site ? "JOIN agents a ON a.id = am.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE am.firewall_status = 'disabled'
      ${site ? "AND ie.site = ?" : ""}
    `,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countFailedJobsRecent(hours = 24, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agent_jobs aj
    ${site ? "JOIN agents a ON a.id = aj.agent_id JOIN ip_entries ie ON ie.id = a.ip_entry_id" : ""}
    WHERE aj.status = 'failed' AND aj.completed_at >= NOW() - INTERVAL ? HOUR
      ${site ? "AND ie.site = ?" : ""}
    `,
    [hours, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

export async function countWuServiceUnavailable(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM computer_metadata cm
    JOIN ip_entries ie ON ie.id = cm.ip_entry_id
    WHERE ie.entry_type = 'computer'
      ${site ? "AND ie.site = ?" : ""}
      AND cm.wu_service_status IS NOT NULL
      AND cm.wu_service_status <> 'Running'
  `,
    site ? [site] : [],
  );
  return Number(cnt) || 0;
}

export async function countStaleUpdateComputers(staleDays = 90, site) {
  const safeDays = Math.max(1, Math.min(Number(staleDays) || 90, 3650));

  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM (
      SELECT ip.id, MAX(cu.installed_on) AS latestUpdate
      FROM ip_entries ip
      LEFT JOIN computer_updates cu ON cu.ip_entry_id = ip.id
      WHERE ip.entry_type = 'computer'
        ${site ? "AND ip.site = ?" : ""}
      GROUP BY ip.id
      HAVING latestUpdate IS NULL OR latestUpdate < CURDATE() - INTERVAL ? DAY
    ) stale
    `,
    [...(site ? [site] : []), safeDays],
  );
  return Number(cnt) || 0;
}
