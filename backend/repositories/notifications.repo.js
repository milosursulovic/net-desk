import { pool } from "../db/pool.js";
import { CONNECTIVITY_STATUS_SQL } from "./agents.repo.js";

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

// Mreža (ping-based ip_entries.is_online) kaže da je računar gore, ali AGENT
// (last_heartbeat_at, isti CONNECTIVITY_STATUS_SQL izraz kao /agents lista i
// njen filter) se ne javlja online - jak signal da je agent proces/servis
// zaglavljen ili pao (npr. posle lošeg deploy-a), ne da je računar ugašen.
// Suprotan smer (agent online, mreža offline - obično samo spor/flaky ping)
// se namerno ne prijavljuje ovde, mnogo je češći i manje značajan. INNER
// JOIN na ip_entries namerno (ne LEFT) - agent bez povezanog ip_entry-ja
// nema sa čim da se uporedi, pa ne može biti "mismatch".
export async function countAgentOfflineButIpOnline(site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agents
    JOIN ip_entries ie ON ie.id = agents.ip_entry_id
    WHERE agents.status = 'active'
      AND ie.is_online = 1
      AND (${CONNECTIVITY_STATUS_SQL}) != 'online'
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

// Broji DISTINKTNE računare (ne redove) čiji je last_seen na bar JEDNOM
// crnolistiranom domenu u prozoru - namerno vremenski prozor (kao
// countFailedJobsRecent), ne "ikad ceo istorijat", da notifikacija prirodno
// nestane kad prestane skorašnja aktivnost (isti "self-resolving" duh kao
// sve ostalo u listNotifications - inače bi ostala zauvek vidljiva jer
// computer_dns_queries redovi nikad ne nestaju).
export async function countBlacklistedDomainHits(hours = 24, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(DISTINCT cdq.ip_entry_id) AS cnt
    FROM computer_dns_queries cdq
    JOIN flagged_domains fd
      ON cdq.domain = fd.domain OR cdq.domain LIKE CONCAT('%.', fd.domain)
    ${site ? "JOIN ip_entries ie ON ie.id = cdq.ip_entry_id" : ""}
    WHERE cdq.last_seen >= NOW() - INTERVAL ? HOUR
      ${site ? "AND ie.site = ?" : ""}
    `,
    [hours, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

// Isti JOIN/vremenski-prozor obrazac kao countBlacklistedDomainHits iznad,
// samo vraća redove (koji računar, koji domen) umesto samo broja - za
// dnevni izveštaj, gde je bitno i ŠTA je posećeno, ne samo koliko računara.
export async function listBlacklistedDomainHits(hours = 24, site) {
  const [rows] = await pool.execute(
    `
    SELECT
      cdq.domain,
      cdq.last_seen AS lastSeen,
      cdq.query_count AS queryCount,
      ie.id AS ipEntryId,
      ie.ip,
      ie.computer_name AS computerName,
      ie.department
    FROM computer_dns_queries cdq
    JOIN flagged_domains fd
      ON cdq.domain = fd.domain OR cdq.domain LIKE CONCAT('%.', fd.domain)
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    WHERE cdq.last_seen >= NOW() - INTERVAL ? HOUR
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY cdq.last_seen DESC
    `,
    [hours, ...(site ? [site] : [])],
  );
  return rows;
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
