import { pool } from "../db/pool.js";

export async function findUserByUsername(username) {
  const [rows] = await pool.execute(
    "SELECT id, username, password, role FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  return rows?.[0] || null;
}

export async function findUserById(id) {
  const [rows] = await pool.execute(
    "SELECT id, username, role, created_at AS createdAt FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows?.[0] || null;
}

export async function listUsers() {
  const [rows] = await pool.execute(
    "SELECT id, username, role, created_at AS createdAt FROM users ORDER BY username ASC",
  );
  return rows;
}

export async function createUser({ username, passwordHash, role }) {
  const [result] = await pool.execute(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, passwordHash, role],
  );
  return result.insertId;
}

export async function updateUserRole(id, role) {
  const [result] = await pool.execute("UPDATE users SET role = ? WHERE id = ?", [
    role,
    id,
  ]);
  return result.affectedRows;
}

export async function deleteUserById(id) {
  const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);
  return result.affectedRows;
}

export async function countAdmins() {
  const [[{ cnt }]] = await pool.execute(
    "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'",
  );
  return Number(cnt) || 0;
}

export async function updateUserPasswordHash(userId, hash) {
  await pool.execute("UPDATE users SET password = ? WHERE id = ?", [
    hash,
    userId,
  ]);
}
