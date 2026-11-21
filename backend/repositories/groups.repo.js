import { pool } from "../db/pool.js";

// "groups" is a reserved word in MySQL/MariaDB (GROUPS window frame syntax)
// - hence groups_list, not groups.
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

// Correlated subquery (not a JOIN) on purpose - the number of groups is small
// (tens, not thousands). groups_list is now ONLY for departments (Home) -
// deployment groups live in the separate deployment_groups_list (deploymentGroups.repo.js).
//
// ip_entries.department is utf8mb4_unicode_ci, while groups_list.name is
// utf8mb4_general_ci (historically inconsistent collations in the schema, out of
// scope to unify everything here) - without an explicit COLLATE, MariaDB throws
// "Illegal mix of collations" on this comparison.
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
