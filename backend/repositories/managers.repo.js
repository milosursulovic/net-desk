import { pool } from "../db/pool.js";

const SELECT_FIELDS = `
  id,
  manager_uid AS managerUid,
  api_key_hash AS apiKeyHash,
  ip_entry_id AS ipEntryId,
  hostname,
  manager_version AS managerVersion,
  status,
  last_ip AS lastIp,
  last_heartbeat_at AS lastHeartbeatAt,
  netdesk_agent_service_status AS netdeskAgentServiceStatus,
  netdesk_agent_start_mode AS netdeskAgentStartMode,
  enrolled_at AS enrolledAt,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

export async function insertManager({ managerUid, apiKeyHash, hostname, managerVersion }) {
  const [result] = await pool.execute(
    `
    INSERT INTO managers
      (manager_uid, api_key_hash, hostname, manager_version, status, enrolled_at)
    VALUES (?, ?, ?, ?, 'active', NOW())
    `,
    [managerUid, apiKeyHash, hostname, managerVersion],
  );
  return result.insertId;
}

export async function findManagerByUid(managerUid) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM managers WHERE manager_uid = ? LIMIT 1`,
    [managerUid],
  );
  return rows?.[0] || null;
}

export async function findManagerById(id) {
  const [rows] = await pool.execute(`SELECT ${SELECT_FIELDS} FROM managers WHERE id = ? LIMIT 1`, [
    id,
  ]);
  return rows?.[0] || null;
}

// For the AgentDetailView.vue correlation - the Manager and the Agent on the same
// machine share the same ip_entry_id (each resolves it independently, in its own
// way), so this is the only link between them (there's no direct agent_id/
// manager_id pair anywhere).
// ORDER BY id DESC is defense in depth, it doesn't rely solely on
// revokeOtherActiveManagers (enrollManager) to never let 2+ rows be
// 'active' at once for the same ip_entry_id - so that HERE it still picks
// the newest one if that ever happens.
export async function findManagerByIpEntryId(ipEntryId) {
  if (!ipEntryId) return null;
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM managers WHERE ip_entry_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
    [ipEntryId],
  );
  return rows?.[0] || null;
}

export async function updateHeartbeat(
  id,
  { hostname, managerVersion, netdeskAgentServiceStatus, netdeskAgentStartMode, lastIp },
) {
  const sets = ["last_heartbeat_at = NOW()", "last_ip = ?"];
  const params = [lastIp];

  if (hostname !== undefined) {
    sets.push("hostname = ?");
    params.push(hostname);
  }
  if (managerVersion !== undefined) {
    sets.push("manager_version = ?");
    params.push(managerVersion);
  }
  if (netdeskAgentServiceStatus !== undefined) {
    sets.push("netdesk_agent_service_status = ?");
    params.push(netdeskAgentServiceStatus);
  }
  if (netdeskAgentStartMode !== undefined) {
    sets.push("netdesk_agent_start_mode = ?");
    params.push(netdeskAgentStartMode);
  }

  params.push(id);

  const [result] = await pool.execute(`UPDATE managers SET ${sets.join(", ")} WHERE id = ?`, params);
  return result.affectedRows;
}

export async function linkManagerToIpEntry(managerId, ipEntryId) {
  await pool.execute(`UPDATE managers SET ip_entry_id = ? WHERE id = ?`, [ipEntryId, managerId]);
}

export async function revokeManagerById(id) {
  const [result] = await pool.execute(`UPDATE managers SET status = 'revoked' WHERE id = ?`, [id]);
  return result.affectedRows;
}

// Called right after enroll (see enrollManager) so that there are NEVER 2+
// 'active' rows for the same ip_entry_id - the Manager service re-enrolls
// whenever it's reinstalled/reprovisioned (it can't recover the old, hash-only
// stored API key), so the new registration replaces the old one instead of being
// added next to it. Without this, listAgents's LEFT JOIN on managers duplicates
// the agent's row in the list (confirmed live - seen on the most recently written agents).
export async function revokeOtherActiveManagers(ipEntryId, exceptManagerId) {
  if (!ipEntryId) return 0;
  const [result] = await pool.execute(
    `UPDATE managers SET status = 'revoked' WHERE ip_entry_id = ? AND status = 'active' AND id != ?`,
    [ipEntryId, exceptManagerId],
  );
  return result.affectedRows;
}
