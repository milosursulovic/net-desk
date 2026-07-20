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

export async function listAgents({ search, status, limit, offset }) {
  const searchClause = buildLikeSearch(["hostname", "agent_uid"], search);
  const whereParts = [];
  const params = [];

  if (searchClause.where) {
    whereParts.push(searchClause.where);
    params.push(...searchClause.params);
  }
  if (status === "active" || status === "revoked") {
    whereParts.push("status = ?");
    params.push(status);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM agents ${whereSql}`,
    params,
  );

  const [items] = await pool.execute(
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
      status,
      last_ip AS lastIp,
      last_heartbeat_at AS lastHeartbeatAt,
      enrolled_at AS enrolledAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM agents
    ${whereSql}
    ORDER BY enrolled_at DESC
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items, total: Number(total) || 0 };
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
