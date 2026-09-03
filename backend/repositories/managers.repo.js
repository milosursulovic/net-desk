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

// Za AgentDetailView.vue korelaciju - Manager i Agent na istoj mašini dele
// isti ip_entry_id (oboje ga razrešavaju nezavisno, svaki svojim putem), pa
// je ovo jedini spoj koji postoji između njih (nema direktnog agent_id/
// manager_id para bilo gde).
// ORDER BY id DESC je odbrana u dubinu, ne oslanja se samo na
// revokeOtherActiveManagers (enrollManager) da nikad ne dozvoli da 2+ reda
// budu 'active' istovremeno za isti ip_entry_id - da ODJE i dalje bira
// najnoviji ako se to ikad desi.
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

// Poziva se odmah posle enroll-a (vidi enrollManager) da NIKAD ne ostanu 2+
// 'active' redova za isti ip_entry_id - Manager servis se ponovo enroll-uje
// kad god je reinstaliran/reprovizovan (ne može da obnovi stari, samo-hash
// sačuvan API key), pa nova registracija zamenjuje staru umesto da joj se
// pridoda. Bez ovoga listAgents-ov LEFT JOIN na managers duplira red agenta
// u listi (uživo potvrđeno - viđeno na najnovije upisanim agentima).
export async function revokeOtherActiveManagers(ipEntryId, exceptManagerId) {
  if (!ipEntryId) return 0;
  const [result] = await pool.execute(
    `UPDATE managers SET status = 'revoked' WHERE ip_entry_id = ? AND status = 'active' AND id != ?`,
    [ipEntryId, exceptManagerId],
  );
  return result.affectedRows;
}
