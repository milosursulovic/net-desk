import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

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
      deployment_group AS deploymentGroup,
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
      deployment_group AS deploymentGroup,
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

export async function updateHeartbeat(id, { hostname, agentVersion, lastIp }) {
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

// "agents" (bez alijasa) je i dalje validan kvalifikator za svoje kolone i
// tamo gde nema JOIN-a (npr. countAgentsByConnectivity ispod) - zato ovaj
// isti izraz radi svuda, prefiksovan ili ne.

// Deljeno između listAgents() (paginirano) i listAgentIds() (svi id-jevi
// koji odgovaraju filterima, za "selektuj sve po filteru" preko svih
// strana) - isti filteri, ista logika, jedno mesto za izmenu. LEFT JOIN
// na ip_entries (preko agents.ip_entry_id) je ovde samo zbog department
// filtera - odeljenje živi na ip_entries, ne na agents.
function buildAgentsWhereClause({
  search,
  status,
  connectivityStatus,
  deploymentGroup,
  os,
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
  if (deploymentGroup) {
    whereParts.push("agents.deployment_group = ?");
    params.push(deploymentGroup);
  }
  if (os) {
    whereParts.push("agents.os_caption = ?");
    params.push(os);
  }
  if (version) {
    whereParts.push("agents.agent_version = ?");
    params.push(version);
  }
  if (versionNot) {
    // Agenti bez izveštene verzije (NULL) su isto "nisu na ovoj verziji" -
    // korisno za pronalaženje agenata koji nikad nisu uspešno prijavili
    // update, ne samo onih zaglavljenih na starijoj verziji.
    whereParts.push("(agents.agent_version IS NULL OR agents.agent_version != ?)");
    params.push(versionNot);
  }
  if (department) {
    whereParts.push("ie.department = ?");
    params.push(department);
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
  // "Neaktivan" = nema potvrdu da je uključen - i "disabled" i "unknown" i
  // "nikad prijavljeno" (NULL/nema reda uopšte) se tretiraju isto, jer je
  // administratoru svejedno KOJI je razlog, samo da mašina nije potvrđeno
  // zaštićena.
  if (antivirusInactive) {
    whereParts.push("(am.antivirus_status IS NULL OR am.antivirus_status != 'enabled')");
  }
  if (firewallInactive) {
    whereParts.push("(am.firewall_status IS NULL OR am.firewall_status != 'enabled')");
  }
  if (windowsUpdateInactive) {
    whereParts.push("(cm.wu_service_status IS NULL OR cm.wu_service_status != 'Running')");
  }
  // Mreža (ping-based ip_entries.is_online) kaže da je računar gore, ali
  // AGENT se ne javlja online - jak signal da je agent proces/servis
  // zaglavljen ili pao (npr. posle lošeg deploy-a), ne da je računar
  // ugašen. Suprotan smer (agent online, mreža offline - obično samo spor/
  // flaky ping) se namerno ne tretira kao problem ovde.
  if (agentOfflineIpOnline) {
    whereParts.push(`(${CONNECTIVITY_STATUS_SQL}) != 'online' AND ie.is_online = 1`);
  }
  if (serviceFilesMismatch) {
    whereParts.push("agents.service_files_mismatch = 1");
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return { whereSql, params };
}

const AGENTS_IP_ENTRY_JOIN = "LEFT JOIN ip_entries ie ON ie.id = agents.ip_entry_id";
// antivirus_status/firewall_status žive na agent_monitoring (heartbeat
// signal, jedan red po agentu preko upsertAgentMonitoring), wu_service_status
// živi na computer_metadata (deo hourly inventory sync-a, vezan preko
// ip_entry_id kao i ostatak metapodataka) - dva odvojena izvora/ciklusa
// osvežavanja, zato dva odvojena LEFT JOIN-a umesto jednog.
const AGENTS_MONITORING_JOIN = "LEFT JOIN agent_monitoring am ON am.agent_id = agents.id";
const AGENTS_METADATA_JOIN = "LEFT JOIN computer_metadata cm ON cm.ip_entry_id = agents.ip_entry_id";

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
      agents.deployment_group AS deploymentGroup,
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
      cm.wu_service_status AS windowsUpdateStatus
    FROM agents
    ${joins}
    ${whereSql}
    ORDER BY agents.enrolled_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items, total: Number(total) || 0 };
}

// Za "selektuj sve po filteru" na /agents - vraća SVE id-jeve koji
// odgovaraju filterima, ne samo trenutnu stranu paginacije. 1000 je
// sigurnosni gornji limit (ne prava paginacija) - dovoljno velik za
// realnu veličinu flote, sprečava patološki neograničen upit.
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

export async function listDistinctAgentDeploymentGroups(site) {
  const whereParts = ["agents.deployment_group IS NOT NULL", "agents.deployment_group != ''"];
  const params = [];
  let join = "";
  if (site) {
    join = AGENTS_IP_ENTRY_JOIN;
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  const [rows] = await pool.execute(
    `SELECT DISTINCT agents.deployment_group FROM agents ${join} WHERE ${whereParts.join(" AND ")} ORDER BY agents.deployment_group`,
    params,
  );
  return rows.map((r) => r.deployment_group);
}

// Prirodno sortiranje ("1.2.10" posle "1.2.9", ne pre) - CAST na svaki
// tačka-odvojen deo verzije kao broj. Pretpostavlja "x.y.z" oblik (isti
// format kao AgentVersionInfo.cs u agentu) - agenti bez tog oblika i dalje
// prolaze, samo im je redosled sortiranja manje pouzdan.
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

// Isti izvor kao AGENTS_METADATA_JOIN (computer_metadata.wu_service_status)
// korišćen u listAgents - za detail stranicu jednog agenta (findAgentById ne
// join-uje computer_metadata, samo agents tabelu).
export async function findAgentWindowsUpdateStatus(ipEntryId) {
  if (!ipEntryId) return null;
  const [rows] = await pool.execute(
    `SELECT wu_service_status AS windowsUpdateStatus FROM computer_metadata WHERE ip_entry_id = ? LIMIT 1`,
    [ipEntryId],
  );
  return rows?.[0]?.windowsUpdateStatus ?? null;
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

export async function updateAgentDeploymentGroup(id, deploymentGroup) {
  const [result] = await pool.execute(
    `UPDATE agents SET deployment_group = ? WHERE id = ?`,
    [deploymentGroup, id],
  );
  return result.affectedRows;
}

// Rezultat checkServiceFilesMismatchService (agentReleases.service.js),
// perzistira se po ciklusu inventory sync-a - details je null kad nema
// neusklađenosti (ili poređenje nije bilo moguće).
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
