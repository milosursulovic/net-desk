import { pool } from "../db/pool.js";

// "groups" je rezervisana reč u MySQL/MariaDB (GROUPS window frame sintaksa)
// - zato groups_list, ne groups.
export async function listGroups() {
  const [rows] = await pool.execute(`SELECT name FROM groups_list ORDER BY name`);
  return rows.map((r) => r.name);
}

export async function insertGroup(name) {
  const [result] = await pool.execute(
    `INSERT INTO groups_list (name) VALUES (?)`,
    [name],
  );
  return result.insertId;
}

// Korelisani sub-upiti (ne JOIN) namerno - broj grupa je mali (desetine, ne
// hiljade), a ovo izbegava dupliranje/grupisanje redova koje bi JOIN preko
// dve nezavisne tabele (ip_entries/agents) inače proizveo.
//
// ip_entries.department je utf8mb4_unicode_ci, dok su groups_list.name i
// agents.deployment_group utf8mb4_general_ci (istorijski nekonzistentne
// kolacije u šemi, van obima ovde da se sve ujednači) - bez eksplicitnog
// COLLATE, MariaDB baca "Illegal mix of collations" na ovom poređenju.
export async function listGroupsWithUsage() {
  const [rows] = await pool.execute(`
    SELECT
      g.name,
      (SELECT COUNT(*) FROM ip_entries WHERE department COLLATE utf8mb4_general_ci = g.name) AS departmentCount,
      (SELECT COUNT(*) FROM agents WHERE deployment_group = g.name) AS deploymentCount
    FROM groups_list g
    ORDER BY g.name
  `);
  return rows;
}

export async function deleteGroupByName(name) {
  const [result] = await pool.execute(`DELETE FROM groups_list WHERE name = ?`, [name]);
  return result.affectedRows;
}
