import { pool } from "../db/pool.js";

export async function findOrCreate({ DisplayName, Publisher }) {
  const [existing] = await pool.query(
    "SELECT software_id FROM software WHERE display_name = ? AND publisher = ?",
    [DisplayName, Publisher],
  );

  if (existing.length) return existing[0].software_id;

  const [insert] = await pool.query(
    "INSERT INTO software (display_name, publisher) VALUES (?, ?)",
    [DisplayName, Publisher],
  );

  return insert.insertId;
}
