import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Deployment groups that mark the OS channel for auto-update targeting (see
// migration 0006_deployment_groups_multi.sql) - a machine has exactly ONE OS,
// so adding an agent to two of these groups at once is always a data-entry
// mistake (e.g. accidentally both win10 and win11), not a legitimate combination
// like department+"all"+architecture. Hardcoded on purpose - there's no
// "category" column/concept on deployment_groups_list, these are simply known names.
export const OS_DEPLOYMENT_GROUPS = ["win7", "win10", "win11", "winsrv"];

export async function insertAgent({
  agentUid,
  apiKeyHash,
  hostname,
  osCaption,
  osVersion,
  osBuild,
  agentVersion,
}) {
  const [result] = await pool.execute(
    `
    INSERT INTO agents
      (agent_uid, api_key_hash, hostname, os_caption, os_version, os_build, agent_version, status, enrolled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NOW())
    `,
    [agentUid, apiKeyHash, hostname, osCaption, osVersion, osBuild, agentVersion],
  );
  return result.insertId;
}

export async function findAgentByUid(agentUid) {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      agent_uid AS agentUid,
      api_key_hash AS apiKeyHash,
      ip_entry_id AS ipEntryId,
      agent_version AS agentVersion,
      status
    FROM agents
    WHERE agent_uid = ?
    LIMIT 1
    `,
    [agentUid],
  );
  return rows?.[0] || null;
}

export async function findAgentById(id) {
  const [rows] = await pool.execute(
    `
    SELECT
      id,
      agent_uid AS agentUid,
      ip_entry_id AS ipEntryId,
      hostname,
      os_caption AS osCaption,
      os_version AS osVersion,
      os_build AS osBuild,
      agent_version AS agentVersion,
      process_kill_exempt AS processKillExempt,
      service_files_mismatch AS serviceFilesMismatch,
      service_files_mismatch_details AS serviceFilesMismatchDetails,
      status,
      last_ip AS lastIp,
      last_heartbeat_at AS lastHeartbeatAt,
      enrolled_at AS enrolledAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM agents
    WHERE id = ?
    LIMIT 1
    `,
    [id],
  );
  return rows?.[0] || null;
}

export async function updateHeartbeat(
  id,
  { hostname, agentVersion, lastIp },
) {
  const sets = ["last_heartbeat_at = NOW()", "last_ip = ?"];
  const params = [lastIp];

  if (hostname !== undefined) {
    sets.push("hostname = ?");
    params.push(hostname);
  }
  if (agentVersion !== undefined) {
    sets.push("agent_version = ?");
    params.push(agentVersion);
  }

  params.push(id);

  const [result] = await pool.execute(
    `UPDATE agents SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  return result.affectedRows;
}

// Mirrors agents.service.js's ONLINE_THRESHOLD_MS (300s) / STALE_THRESHOLD_MS
// (1800s) computeConnectivityStatus() logic, but as SQL so it can be
// filtered/paginated in the same query instead of after the fact in JS -
// keep both in sync if the thresholds ever change. Exported so
// notifications.repo.js can reuse the exact same "is this agent online"
// definition (agent-vs-ping mismatch check), instead of a second copy of
// the same thresholds drifting out of sync.
export const CONNECTIVITY_STATUS_SQL = `
  CASE
    WHEN agents.last_heartbeat_at IS NULL THEN 'unknown'
    WHEN TIMESTAMPDIFF(SECOND, agents.last_heartbeat_at, NOW()) <= 300 THEN 'online'
    WHEN TIMESTAMPDIFF(SECOND, agents.last_heartbeat_at, NOW()) <= 1800 THEN 'stale'
    ELSE 'offline'
  END
`;

// "agents" (unaliased) is still a valid qualifier for its own columns even
// where there's no JOIN (e.g. countAgentsByConnectivity below) - which is why
// this same expression works everywhere, prefixed or not.

// Shared between listAgents() (paginated) and listAgentIds() (all ids
// matching the filters, for "select all matching the filter" across all
// pages) - same filters, same logic, one place to change. The LEFT JOIN
// on ip_entries (via agents.ip_entry_id) is here only for the department
// filter - department lives on ip_entries, not on agents.
function buildAgentsWhereClause({
  search,
  status,
  connectivityStatus,
  deploymentGroup,
  os,
  osArchitecture,
  version,
  versionNot,
  department,
  site,
  enrolledFrom,
  enrolledTo,
  heartbeatFrom,
  heartbeatTo,
  antivirusInactive,
  firewallInactive,
  windowsUpdateInactive,
  agentOfflineIpOnline,
  serviceFilesMismatch,
  processKillExempt,
  deploymentGroupOsOverlap,
  noDeploymentGroup,
  hasManagerChannel,
  trustedRootCertInstalled,
  intermediateCertInstalled,
  secureDnsDisabled,
  managerVersion,
  managerVersionNot,
}) {
  const searchClause = buildLikeSearch(["agents.hostname", "agents.agent_uid"], search);
  const whereParts = [];
  const params = [];

  if (searchClause.where) {
    whereParts.push(searchClause.where);
    params.push(...searchClause.params);
  }
  if (status === "active" || status === "revoked") {
    whereParts.push("agents.status = ?");
    params.push(status);
  }
  if (connectivityStatus) {
    whereParts.push(`(${CONNECTIVITY_STATUS_SQL}) = ?`);
    params.push(connectivityStatus);
  }
  // deploymentGroup/os/version/versionNot/department are multiselects on the
  // frontend - "at least one selected" = matches ANY of the selected
  // values (IN/EXISTS-IN), not AND/intersection.
  if (deploymentGroup?.length) {
    whereParts.push(
      `EXISTS (SELECT 1 FROM agent_deployment_groups adg WHERE adg.agent_id = agents.id AND adg.group_name IN (${deploymentGroup.map(() => "?").join(",")}))`,
    );
    params.push(...deploymentGroup);
  }
  if (os?.length) {
    whereParts.push(`agents.os_caption IN (${os.map(() => "?").join(",")})`);
    params.push(...os);
  }
  if (osArchitecture) {
    // Lives on ip_entries (same source/column as Home's architecture), not
    // agents - filled by the same inventory sync (os.Architecture, see
    // extractOsArchitecture in agents.service.js).
    whereParts.push("ie.os_architecture = ?");
    params.push(osArchitecture);
  }
  if (version?.length) {
    whereParts.push(`agents.agent_version IN (${version.map(() => "?").join(",")})`);
    params.push(...version);
  }
  if (versionNot?.length) {
    // Agents with no reported version (NULL) are also "not on this version" -
    // useful for finding agents that never successfully reported an update,
    // not just those stuck on an older version.
    whereParts.push(
      `(agents.agent_version IS NULL OR agents.agent_version NOT IN (${versionNot.map(() => "?").join(",")}))`,
    );
    params.push(...versionNot);
  }
  if (department?.length) {
    whereParts.push(`ie.department IN (${department.map(() => "?").join(",")})`);
    params.push(...department);
  }
  if (site) {
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  if (enrolledFrom) {
    whereParts.push("DATE(agents.enrolled_at) >= ?");
    params.push(enrolledFrom);
  }
  if (enrolledTo) {
    whereParts.push("DATE(agents.enrolled_at) <= ?");
    params.push(enrolledTo);
  }
  if (heartbeatFrom) {
    whereParts.push("DATE(agents.last_heartbeat_at) >= ?");
    params.push(heartbeatFrom);
  }
  if (heartbeatTo) {
    whereParts.push("DATE(agents.last_heartbeat_at) <= ?");
    params.push(heartbeatTo);
  }
  // "Inactive" = no confirmation that it's turned on - "disabled", "unknown"
  // and "never reported" (NULL/no row at all) are all treated the same, because
  // the administrator doesn't care WHICH reason it is, only that the machine
  // isn't confirmed protected.
  if (antivirusInactive) {
    whereParts.push("(am.antivirus_status IS NULL OR am.antivirus_status != 'enabled')");
  }
  if (firewallInactive) {
    whereParts.push("(am.firewall_status IS NULL OR am.firewall_status != 'enabled')");
  }
  if (windowsUpdateInactive) {
    whereParts.push("(cm.wu_service_status IS NULL OR cm.wu_service_status != 'Running')");
  }
  // The network (ping-based ip_entries.is_online) says the computer is up, but
  // the AGENT isn't reporting online - a strong signal that the agent
  // process/service is stuck or crashed (e.g. after a bad deploy), not that the
  // computer is turned off. The opposite direction (agent online, network
  // offline - usually just a slow/flaky ping) is deliberately not treated as a problem here.
  if (agentOfflineIpOnline) {
    whereParts.push(`(${CONNECTIVITY_STATUS_SQL}) != 'online' AND ie.is_online = 1`);
  }
  if (serviceFilesMismatch) {
    whereParts.push("agents.service_files_mismatch = 1");
  }
  if (processKillExempt) {
    whereParts.push("agents.process_kill_exempt = 1");
  }
  // Agent in 2+ OS groups at once (e.g. win7+win10) - almost certainly a
  // data-entry mistake, see OS_DEPLOYMENT_GROUPS above.
  if (deploymentGroupOsOverlap) {
    whereParts.push(
      `(SELECT COUNT(DISTINCT adg.group_name) FROM agent_deployment_groups adg
        WHERE adg.agent_id = agents.id AND adg.group_name IN (${OS_DEPLOYMENT_GROUPS.map(() => "?").join(",")})) > 1`,
    );
    params.push(...OS_DEPLOYMENT_GROUPS);
  }
  if (noDeploymentGroup) {
    whereParts.push(
      "NOT EXISTS (SELECT 1 FROM agent_deployment_groups adg WHERE adg.agent_id = agents.id)",
    );
  }
  // "Is the NEW (independent HTTP channel) Manager registered on this
  // machine" - matches via the same ip_entry_id, not agent_id (the Manager and
  // the Agent have no direct link, they just share the machine). Doesn't tell an
  // "old mailbox-only Manager" from "no Manager at all" - the backend generally
  // can't, the old Manager never reports anything to the server (see the note in the plan).
  if (hasManagerChannel === true) {
    whereParts.push(
      "EXISTS (SELECT 1 FROM managers m WHERE m.ip_entry_id = agents.ip_entry_id AND m.status = 'active')",
    );
  } else if (hasManagerChannel === false) {
    whereParts.push(
      "NOT EXISTS (SELECT 1 FROM managers m WHERE m.ip_entry_id = agents.ip_entry_id AND m.status = 'active')",
    );
  }
  // Certificates and Secure DNS state live on ip_entries (SecurityPostureCollector.cs
  // via inventory sync) - false groups "confirmed absent" (0) and "never checked"
  // (NULL) into the same "missing" result, because both are equally actionable
  // for the admin (a machine that needs fixing), unlike hasManagerChannel
  // above where the NULL/EXISTS distinction doesn't exist.
  if (trustedRootCertInstalled === true) {
    whereParts.push("ie.trusted_root_cert_installed = 1");
  } else if (trustedRootCertInstalled === false) {
    whereParts.push("(ie.trusted_root_cert_installed = 0 OR ie.trusted_root_cert_installed IS NULL)");
  }
  if (intermediateCertInstalled === true) {
    whereParts.push("ie.intermediate_cert_installed = 1");
  } else if (intermediateCertInstalled === false) {
    whereParts.push("(ie.intermediate_cert_installed = 0 OR ie.intermediate_cert_installed IS NULL)");
  }
  if (secureDnsDisabled === true) {
    whereParts.push("ie.secure_dns_disabled = 1");
  } else if (secureDnsDisabled === false) {
    whereParts.push("(ie.secure_dns_disabled = 0 OR ie.secure_dns_disabled IS NULL)");
  }
  // managers.manager_version - same "at least one selected" multiselect pattern
  // as version/versionNot above, via EXISTS (not a JOIN in WHERE) for the same
  // reason as hasManagerChannel: whereSql is also used in the COUNT query, which
  // has no AGENTS_MANAGER_JOIN. NOT EXISTS for managerVersionNot naturally
  // covers "no Manager registered at all" as "not on this version" too -
  // same treatment as the NULL agent_version case in versionNot, with no need
  // for a separate NULL condition.
  if (managerVersion?.length) {
    whereParts.push(
      `EXISTS (SELECT 1 FROM managers m WHERE m.ip_entry_id = agents.ip_entry_id AND m.status = 'active' AND m.manager_version IN (${managerVersion.map(() => "?").join(",")}))`,
    );
    params.push(...managerVersion);
  }
  if (managerVersionNot?.length) {
    whereParts.push(
      `NOT EXISTS (SELECT 1 FROM managers m WHERE m.ip_entry_id = agents.ip_entry_id AND m.status = 'active' AND m.manager_version IN (${managerVersionNot.map(() => "?").join(",")}))`,
    );
    params.push(...managerVersionNot);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return { whereSql, params };
}

const AGENTS_IP_ENTRY_JOIN = "LEFT JOIN ip_entries ie ON ie.id = agents.ip_entry_id";
// antivirus_status/firewall_status live on agent_monitoring (heartbeat
// signal, one row per agent via upsertAgentMonitoring), wu_service_status
// lives on computer_metadata (part of the hourly inventory sync, linked via
// ip_entry_id like the rest of the metadata) - two separate sources/refresh
// cycles, hence two separate LEFT JOINs instead of one.
const AGENTS_MONITORING_JOIN = "LEFT JOIN agent_monitoring am ON am.agent_id = agents.id";
const AGENTS_METADATA_JOIN = "LEFT JOIN computer_metadata cm ON cm.ip_entry_id = agents.ip_entry_id";
// Only for listAgents (the badge in the list) - findAgentById/the other functions
// here deliberately don't fetch this; AgentDetailView.vue calls a separate
// /manager-status endpoint (getAgentManagerStatusController) instead of
// widening this JOIN to every call.
// The condition "mgr.id = newest active row for this ip_entry_id" is defense
// in depth (not just relying on revokeOtherActiveManagers in
// enrollManager) - regression: without it, every 'active' row for the same
// ip_entry_id duplicates the agent's row in the result (LEFT JOIN 1:N),
// confirmed live on newly enrolled agents.
const AGENTS_MANAGER_JOIN = `
  LEFT JOIN managers mgr
    ON mgr.ip_entry_id = agents.ip_entry_id
    AND mgr.status = 'active'
    AND mgr.id = (
      SELECT MAX(m2.id) FROM managers m2
      WHERE m2.ip_entry_id = agents.ip_entry_id AND m2.status = 'active'
    )
`;

// Same thresholds as CONNECTIVITY_STATUS_SQL - NULL (not 'unknown') when no
// managers row exists at all for this ip_entry_id (the LEFT JOIN matched
// nothing), to distinguish "Manager not registered" from "Manager registered
// but hasn't sent a heartbeat yet".
const MANAGER_CHANNEL_STATUS_SQL = `
  CASE
    WHEN mgr.id IS NULL THEN NULL
    WHEN mgr.last_heartbeat_at IS NULL THEN 'unknown'
    WHEN TIMESTAMPDIFF(SECOND, mgr.last_heartbeat_at, NOW()) <= 300 THEN 'online'
    WHEN TIMESTAMPDIFF(SECOND, mgr.last_heartbeat_at, NOW()) <= 1800 THEN 'stale'
    ELSE 'offline'
  END
`;

export async function listAgents(filters) {
  const { whereSql, params } = buildAgentsWhereClause(filters);
  const { limit, offset } = filters;
  const joins = `${AGENTS_IP_ENTRY_JOIN} ${AGENTS_MONITORING_JOIN} ${AGENTS_METADATA_JOIN}`;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agents ${joins} ${whereSql}`,
    params,
  );

  const [items] = await pool.execute(
    `
    SELECT
      agents.id,
      agents.agent_uid AS agentUid,
      agents.ip_entry_id AS ipEntryId,
      agents.hostname,
      agents.os_caption AS osCaption,
      agents.os_version AS osVersion,
      agents.os_build AS osBuild,
      agents.agent_version AS agentVersion,
      (SELECT GROUP_CONCAT(group_name ORDER BY group_name SEPARATOR ', ')
       FROM agent_deployment_groups WHERE agent_id = agents.id) AS deploymentGroups,
      agents.service_files_mismatch AS serviceFilesMismatch,
      agents.service_files_mismatch_details AS serviceFilesMismatchDetails,
      agents.status,
      agents.last_ip AS lastIp,
      agents.last_heartbeat_at AS lastHeartbeatAt,
      agents.enrolled_at AS enrolledAt,
      agents.created_at AS createdAt,
      agents.updated_at AS updatedAt,
      ie.department,
      ie.is_online AS ipIsOnline,
      am.antivirus_status AS antivirusStatus,
      am.firewall_status AS firewallStatus,
      cm.wu_service_status AS windowsUpdateStatus,
      (${MANAGER_CHANNEL_STATUS_SQL}) AS managerChannelStatus,
      mgr.manager_version AS managerVersion
    FROM agents
    ${joins} ${AGENTS_MANAGER_JOIN}
    ${whereSql}
    ORDER BY agents.enrolled_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items, total: Number(total) || 0 };
}

// For "select all matching the filter" on /agents - returns ALL ids that
// match the filters, not just the current pagination page. 1000 is a
// safety upper limit (not real pagination) - large enough for the
// realistic fleet size, prevents a pathologically unbounded query.
const MAX_MATCHING_IDS = 1000;

export async function listAgentIds(filters) {
  const { whereSql, params } = buildAgentsWhereClause(filters);
  const joins = `${AGENTS_IP_ENTRY_JOIN} ${AGENTS_MONITORING_JOIN} ${AGENTS_METADATA_JOIN}`;

  const [rows] = await pool.execute(
    `SELECT agents.id FROM agents ${joins} ${whereSql} ORDER BY agents.enrolled_at DESC LIMIT ${MAX_MATCHING_IDS}`,
    params,
  );
  return rows.map((r) => r.id);
}

export async function listDistinctAgentOs(site) {
  const whereParts = ["agents.os_caption IS NOT NULL", "agents.os_caption != ''"];
  const params = [];
  let join = "";
  if (site) {
    join = AGENTS_IP_ENTRY_JOIN;
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT agents.os_caption FROM agents ${join} WHERE ${whereParts.join(" AND ")} ORDER BY agents.os_caption`,
    params,
  );
  return rows.map((r) => r.os_caption);
}

// os_architecture lives on ip_entries (same source as Home's architecture),
// not on agents - so the JOIN is always needed (not only when a site is given,
// unlike listDistinctAgentOs above).
export async function listDistinctAgentOsArchitectures(site) {
  const whereParts = ["ie.os_architecture IS NOT NULL", "ie.os_architecture != ''"];
  const params = [];
  if (site) {
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT ie.os_architecture FROM agents ${AGENTS_IP_ENTRY_JOIN} WHERE ${whereParts.join(" AND ")} ORDER BY ie.os_architecture`,
    params,
  );
  return rows.map((r) => r.os_architecture);
}

export async function listDistinctAgentDeploymentGroups(site) {
  const params = [];
  let siteWhere = "";
  let join = "";
  if (site) {
    join = AGENTS_IP_ENTRY_JOIN;
    siteWhere = "WHERE ie.site = ?";
    params.push(site);
  }
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT adg.group_name
    FROM agent_deployment_groups adg
    JOIN agents ON agents.id = adg.agent_id
    ${join}
    ${siteWhere}
    ORDER BY adg.group_name
    `,
    params,
  );
  return rows.map((r) => r.group_name);
}

// Natural sort ("1.2.10" after "1.2.9", not before) - CAST of each
// dot-separated part of the version to a number. Assumes the "x.y.z" shape
// (same format as AgentVersionInfo.cs in the agent) - agents without that
// shape still pass through, their sort order is just less reliable.
export async function listDistinctAgentVersions(site) {
  const whereParts = ["agents.agent_version IS NOT NULL", "agents.agent_version != ''"];
  const params = [];
  let join = "";
  if (site) {
    join = AGENTS_IP_ENTRY_JOIN;
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT agents.agent_version
    FROM agents ${join}
    WHERE ${whereParts.join(" AND ")}
    ORDER BY
      CAST(SUBSTRING_INDEX(agents.agent_version, '.', 1) AS UNSIGNED) DESC,
      CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(agents.agent_version, '.', 2), '.', -1) AS UNSIGNED) DESC,
      CAST(SUBSTRING_INDEX(agents.agent_version, '.', -1) AS UNSIGNED) DESC
    `,
    params,
  );
  return rows.map((r) => r.agent_version);
}

// Same pattern as listDistinctAgentVersions above, but for managers.manager_version
// (a separate table, linked via ip_entry_id - not agent_id). Only active
// Managers (status='active') are counted - revoked/historical ones shouldn't
// show up in the dropdown.
export async function listDistinctManagerVersions(site) {
  const whereParts = [
    "mgr.status = 'active'",
    "mgr.manager_version IS NOT NULL",
    "mgr.manager_version != ''",
  ];
  const params = [];
  let siteJoin = "";
  if (site) {
    siteJoin = AGENTS_IP_ENTRY_JOIN;
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `
    SELECT DISTINCT mgr.manager_version
    FROM agents ${siteJoin}
    JOIN managers mgr ON mgr.ip_entry_id = agents.ip_entry_id
    WHERE ${whereParts.join(" AND ")}
    ORDER BY
      CAST(SUBSTRING_INDEX(mgr.manager_version, '.', 1) AS UNSIGNED) DESC,
      CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(mgr.manager_version, '.', 2), '.', -1) AS UNSIGNED) DESC,
      CAST(SUBSTRING_INDEX(mgr.manager_version, '.', -1) AS UNSIGNED) DESC
    `,
    params,
  );
  return rows.map((r) => r.manager_version);
}

// Fleet breakdown for the daily report - reuses the same CASE expression
// (and thresholds) that listAgents()'s connectivityStatus filter matches
// against, so the counts here are always consistent with what the filter
// would return.
export async function countAgentsByConnectivity(site) {
  const [rows] = await pool.execute(
    `
    SELECT (${CONNECTIVITY_STATUS_SQL}) AS status, COUNT(*) AS cnt
    FROM agents
    ${site ? AGENTS_IP_ENTRY_JOIN : ""}
    WHERE agents.status = 'active'
      ${site ? "AND ie.site = ?" : ""}
    GROUP BY status
    `,
    site ? [site] : [],
  );
  const out = { online: 0, stale: 0, offline: 0, unknown: 0 };
  for (const r of rows) out[r.status] = Number(r.cnt) || 0;
  return out;
}

export async function listAgentsEnrolledSince(since, limit = 20, site) {
  const [rows] = await pool.execute(
    `
    SELECT agents.hostname, agents.agent_uid AS agentUid, agents.enrolled_at AS enrolledAt
    FROM agents
    ${site ? AGENTS_IP_ENTRY_JOIN : ""}
    WHERE agents.enrolled_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    ORDER BY agents.enrolled_at DESC
    LIMIT ?
    `,
    [since, ...(site ? [site] : []), limit],
  );
  return rows;
}

export async function countAgentsEnrolledSince(since, site) {
  const [[{ cnt }]] = await pool.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM agents
    ${site ? AGENTS_IP_ENTRY_JOIN : ""}
    WHERE agents.enrolled_at >= ?
      ${site ? "AND ie.site = ?" : ""}
    `,
    [since, ...(site ? [site] : [])],
  );
  return Number(cnt) || 0;
}

export async function revokeAgentById(id) {
  const [result] = await pool.execute(
    `UPDATE agents SET status = 'revoked' WHERE id = ?`,
    [id],
  );
  return result.affectedRows;
}

// agent_jobs/agent_monitoring/agent_monitoring_history/agent_update_log/
// agent_deployment_groups/vnc_sessions all have an FK to agents.id with ON
// DELETE CASCADE - a single DELETE here cleans all of it with no manual code.
// Deliberately does NOT touch ip_entries (agents.ip_entry_id is the only FK
// direction - a deleted agent must not drag the computer/IP entry along with it).
export async function deleteAgentById(id) {
  const [result] = await pool.execute(`DELETE FROM agents WHERE id = ?`, [id]);
  return result.affectedRows;
}

export async function upsertAgentMonitoring(agentId, data) {
  await pool.execute(
    `
    INSERT INTO agent_monitoring
      (agent_id, cpu_load_pct, ram_load_pct, disk_used_pct, disk_free_gb,
       network_connected, antivirus_status, firewall_status, bitlocker_status,
       temperature_c, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      cpu_load_pct = VALUES(cpu_load_pct),
      ram_load_pct = VALUES(ram_load_pct),
      disk_used_pct = VALUES(disk_used_pct),
      disk_free_gb = VALUES(disk_free_gb),
      network_connected = VALUES(network_connected),
      antivirus_status = VALUES(antivirus_status),
      firewall_status = VALUES(firewall_status),
      bitlocker_status = VALUES(bitlocker_status),
      temperature_c = VALUES(temperature_c),
      collected_at = NOW()
    `,
    [
      agentId,
      data.cpuLoadPct ?? null,
      data.ramLoadPct ?? null,
      data.diskUsedPct ?? null,
      data.diskFreeGb ?? null,
      data.networkConnected == null ? null : data.networkConnected ? 1 : 0,
      data.antivirusStatus ?? null,
      data.firewallStatus ?? null,
      data.bitlockerStatus ?? null,
      data.temperatureC ?? null,
    ],
  );
}

// Same source as AGENTS_METADATA_JOIN (computer_metadata.wu_service_status)
// used in listAgents - for a single agent's detail page (findAgentById doesn't
// join computer_metadata, only the agents table).
export async function findAgentWindowsUpdateStatus(ipEntryId) {
  if (!ipEntryId) return null;
  const [rows] = await pool.execute(
    `SELECT wu_service_status AS windowsUpdateStatus FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
    [ipEntryId],
  );
  return rows?.[0]?.windowsUpdateStatus ?? null;
}

// ip/site from the linked ip_entries row - for the "Open on Home" link on
// AgentDetailView.vue (searching by IP also requires the exact site query param,
// see useCurrentSite.js - site lives exclusively in the URL). department/description
// are here for the same reason as site/ip - they live on ip_entries, not on agents
// (same source as the "Odeljenje" (department) filter on AgentsView.vue), and are
// shown on AgentDetailView.vue next to the agent's name / as the description.
export async function findAgentIpEntry(ipEntryId) {
  if (!ipEntryId) return null;
  const [rows] = await pool.execute(
    `SELECT ip, site, department, description FROM ip_entries WHERE id = ? LIMIT 1`,
    [ipEntryId],
  );
  return rows?.[0] || null;
}

export async function findAgentMonitoring(agentId) {
  const [rows] = await pool.execute(
    `
    SELECT
      agent_id AS agentId,
      cpu_load_pct AS cpuLoadPct,
      ram_load_pct AS ramLoadPct,
      disk_used_pct AS diskUsedPct,
      disk_free_gb AS diskFreeGb,
      network_connected AS networkConnected,
      antivirus_status AS antivirusStatus,
      firewall_status AS firewallStatus,
      bitlocker_status AS bitlockerStatus,
      temperature_c AS temperatureC,
      collected_at AS collectedAt,
      updated_at AS updatedAt
    FROM agent_monitoring
    WHERE agent_id = ?
    LIMIT 1
    `,
    [agentId],
  );
  return rows?.[0] || null;
}

export async function linkAgentToIpEntry(agentId, ipEntryId) {
  await pool.execute(`UPDATE agents SET ip_entry_id = ? WHERE id = ?`, [
    ipEntryId,
    agentId,
  ]);
}

export async function updateAgentVersion(agentId, version) {
  await pool.execute(`UPDATE agents SET agent_version = ? WHERE id = ?`, [
    version,
    agentId,
  ]);
}

// Result of checkServiceFilesMismatchService (agentReleases.service.js),
// persisted per inventory sync cycle - details is null when there's no
// mismatch (or the comparison wasn't possible).
export async function updateAgentServiceFilesMismatch(agentId, mismatch, details) {
  await pool.execute(
    `UPDATE agents SET service_files_mismatch = ?, service_files_mismatch_details = ? WHERE id = ?`,
    [mismatch ? 1 : 0, details, agentId],
  );
}

export async function updateAgentProcessKillExempt(id, exempt) {
  const [result] = await pool.execute(
    `UPDATE agents SET process_kill_exempt = ? WHERE id = ?`,
    [exempt ? 1 : 0, id],
  );
  return result.affectedRows;
}
