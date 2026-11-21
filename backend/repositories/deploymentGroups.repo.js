import { pool } from "../db/pool.js";

// A predefined list separate from groups_list - groups_list stays only for
// "Odeljenje" (department) on IP entries, this one is only for deployment groups
// on agents (agent_deployment_groups) and releases (agent_release_groups).
export async function listDeploymentGroups() {
  const [rows] = await pool.execute(`SELECT name FROM deployment_groups_list ORDER BY name`);
  return rows.map((r) => r.name);
}

export async function insertDeploymentGroup(name) {
  const [result] = await pool.execute(
    `INSERT INTO deployment_groups_list (name) VALUES (?)`,
    [name],
  );
  return result.insertId;
}

// Correlated subqueries (not a JOIN), same pattern as listGroupsWithUsage -
// the number of groups is small; avoids duplication/grouping across two
// independent tables.
export async function listDeploymentGroupsWithUsage() {
  const [rows] = await pool.execute(`
    SELECT
      g.name,
      (SELECT COUNT(*) FROM agent_deployment_groups WHERE group_name = g.name) AS agentCount,
      (SELECT COUNT(*) FROM agent_release_groups WHERE deployment_group = g.name) AS releaseCount
    FROM deployment_groups_list g
    ORDER BY g.name
  `);
  return rows;
}

export async function deleteDeploymentGroupByName(name) {
  const [result] = await pool.execute(`DELETE FROM deployment_groups_list WHERE name = ?`, [name]);
  return result.affectedRows;
}

export async function listAgentDeploymentGroups(agentId) {
  const [rows] = await pool.execute(
    `SELECT group_name FROM agent_deployment_groups WHERE agent_id = ? ORDER BY group_name`,
    [agentId],
  );
  return rows.map((r) => r.group_name);
}

export async function addAgentDeploymentGroup(agentId, groupName) {
  await pool.execute(
    `INSERT IGNORE INTO agent_deployment_groups (agent_id, group_name) VALUES (?, ?)`,
    [agentId, groupName],
  );
}

export async function removeAgentDeploymentGroup(agentId, groupName) {
  await pool.execute(
    `DELETE FROM agent_deployment_groups WHERE agent_id = ? AND group_name = ?`,
    [agentId, groupName],
  );
}
