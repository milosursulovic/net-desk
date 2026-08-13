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

// Korelisani sub-upit (ne JOIN) namerno - broj grupa je mali (desetine, ne
// hiljade). groups_list je sad SAMO za odeljenje (Home) - deployment grupe
// žive u odvojenoj deployment_groups_list (deploymentGroups.repo.js).
//
// ip_entries.department je utf8mb4_unicode_ci, dok je groups_list.name
// utf8mb4_general_ci (istorijski nekonzistentne kolacije u šemi, van obima
// ovde da se sve ujednači) - bez eksplicitnog COLLATE, MariaDB baca
// "Illegal mix of collations" na ovom poređenju.
export async function listGroupsWithUsage() {
  const [rows] = await pool.execute(`
    SELECT
      g.name,
      (SELECT COUNT(*) FROM ip_entries WHERE department COLLATE utf8mb4_general_ci = g.name) AS departmentCount
    FROM groups_list g
    ORDER BY g.name
  `);
  return rows;
}

export async function deleteGroupByName(name) {
  const [result] = await pool.execute(`DELETE FROM groups_list WHERE name = ?`, [name]);
  return result.affectedRows;
}
