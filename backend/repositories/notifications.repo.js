import { pool } from "../db/pool.js";
import { CONNECTIVITY_STATUS_SQL } from "./agents.repo.js";
import { FLAGGED_DOMAIN_MATCH_SQL } from "./dnsLogs.repo.js";

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

// The network (ping-based ip_entries.is_online) says the computer is up, but the AGENT
// (last_heartbeat_at, the same CONNECTIVITY_STATUS_SQL expression as the /agents list and
// its filter) isn't reporting online - a strong signal that the agent process/service
// is stuck or crashed (e.g. after a bad deploy), not that the computer is turned off.
// The opposite direction (agent online, network offline - usually just a slow/flaky ping)
// is deliberately not reported here; it's much more common and less significant. INNER
// JOIN on ip_entries on purpose (not LEFT) - an agent without a linked ip_entry
// has nothing to compare against, so it can't be a "mismatch".
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

// Counts DISTINCT computers (not rows) whose last_seen on at least ONE
// blacklisted domain falls within the window - a time window on purpose (like
// countFailedJobsRecent), not "the whole history ever", so the notification naturally
// disappears once recent activity stops (the same "self-resolving" spirit as
// everything else in listNotifications - otherwise it would stay visible forever since
// computer_dns_queries rows never go away).
export async function countBlacklistedDomainHits(hours = 24, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(DISTINCT cdq.ip_entry_id) AS cnt
    FROM computer_dns_queries cdq
    ${site ? "JOIN ip_entries ie ON ie.id = cdq.ip_entry_id" : ""}
    WHERE cdq.last_seen >= NOW() - INTERVAL ? HOUR
      AND ${FLAGGED_DOMAIN_MATCH_SQL}
      ${site ? "AND ie.site = ?" : ""}
    `,
    [hours, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

// The same time-window pattern as countBlacklistedDomainHits above, but it
// returns rows (which computer, which domain) instead of just a count - for the daily
// report, where WHAT was visited matters too, not just how many computers.
//
// FLAGGED_DOMAIN_MATCH_SQL is DELIBERATELY in WHERE, not in JOIN ... ON as before -
// that was a production OOM bug (hit live on 2026-08-13, when
// flagged_domains jumped from ~200 to ~88900 rows via bulk import). The expression is
// a set of SELF-CONTAINED correlated EXISTS subqueries (each defines ITS OWN
// local "fd" alias, none references the outer join), so "JOIN flagged_domains
// fd ON <expression>" never actually depended on THAT specific fd row -
// MySQL effectively treated it as a constant per cdq row, producing a
// full cross product (matched_cdq_rows × ALL flagged_domains rows)
// instead of filtering. With 147 hits × 88863 flagged_domains, that's ~13
// million rows mysql2 tried to materialize into JS objects -
// enough to bring down the Node heap. The WHERE expression is already a complete
// filter by itself (EXISTS subqueries), no outer JOIN on flagged_domains is
// needed - the SELECT list here never read a single fd.* column anyway.
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
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    WHERE cdq.last_seen >= NOW() - INTERVAL ? HOUR
      AND ${FLAGGED_DOMAIN_MATCH_SQL}
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
