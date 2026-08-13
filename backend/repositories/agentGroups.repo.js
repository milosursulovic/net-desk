import { pool } from "../db/pool.js";

// Opšta "dodatne grupe" veza (many-to-many) - agent može da bude u proizvoljno
// mnogo dodatnih grupa, ODVOJENO od deployment grupa (agent_deployment_groups,
// vidi deploymentGroups.repo.js) - ove NE utiču na auto-update targeting.
// Trenutno automatski popunjena arhitektura (x86/x64, vidi setAgentArchGroup)
// plus ručno dodate proizvoljne grupe (addAgentGroup/removeAgentGroup ispod).
export async function listAgentGroups(agentId) {
  const [rows] = await pool.execute(
    `SELECT group_name FROM agent_groups WHERE agent_id = ? ORDER BY group_name`,
    [agentId],
  );
  return rows.map((r) => r.group_name);
}

// Ukloni prethodni x86/x64 tag (ako postoji) pa dodaj novi - arhitektura se
// praktično nikad ne menja na istoj mašini, ali ovo ostaje ispravno i za
// redak slučaj (npr. re-imaged mašina) bez ostavljanja duplog/zastarelog taga.
export async function setAgentArchGroup(agentId, archGroup) {
  await pool.execute(
    `DELETE FROM agent_groups WHERE agent_id = ? AND group_name IN ('x86', 'x64')`,
    [agentId],
  );
  await pool.execute(
    `INSERT IGNORE INTO agent_groups (agent_id, group_name) VALUES (?, ?)`,
    [agentId, archGroup],
  );
}

// Ručno dodavanje/uklanjanje proizvoljne dodatne grupe (npr. sa Agent Detail
// strane) - slobodan naziv, nije vezano za groups_list (agent_groups je
// namerno opštiji od te predefinisane liste).
export async function addAgentGroup(agentId, groupName) {
  await pool.execute(
    `INSERT IGNORE INTO agent_groups (agent_id, group_name) VALUES (?, ?)`,
    [agentId, groupName],
  );
}

export async function removeAgentGroup(agentId, groupName) {
  await pool.execute(
    `DELETE FROM agent_groups WHERE agent_id = ? AND group_name = ?`,
    [agentId, groupName],
  );
}
