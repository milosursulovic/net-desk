import { pool } from "../db/pool.js";

export async function findUserByUsername(username) {
  const [rows] = await pool.execute(
    "SELECT id, username, password FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  return rows?.[0] || null;
}

export async function updateUserPasswordHash(userId, hash) {
  await pool.execute("UPDATE users SET password = ? WHERE id = ?", [
    hash,
    userId,
  ]);
}
