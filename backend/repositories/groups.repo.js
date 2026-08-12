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
