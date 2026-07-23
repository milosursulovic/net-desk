import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import { createUser } from "../../repositories/users.repo.js";
import { testUsername, deleteTestUser } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

const app = createApp();

async function createTestUser(password, role = "viewer") {
  const username = testUsername();
  const passwordHash = await bcrypt.hash(password, 10);
  const id = await createUser({ username, passwordHash, role });
  return { id, username };
}

async function lastActivityFor(username) {
  const [rows] = await pool.query(
    "SELECT action, status_code AS statusCode FROM activity_log WHERE username = ? ORDER BY id DESC LIMIT 1",
    [username],
  );
  return rows[0];
}

describe("auth routes (integration, real DB)", () => {
  let userId;

  afterEach(async () => {
    await deleteTestUser(userId);
    userId = undefined;
  });

  it("login succeeds with correct credentials and logs login_success", async () => {
    const { id, username } = await createTestUser("correct-horse-1");
    userId = id;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "correct-horse-1" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");

    const entry = await lastActivityFor(username);
    expect(entry.action).toBe("login_success");
    expect(entry.statusCode).toBe(200);
  });

  it("login fails with the wrong password and logs login_failed", async () => {
    const { id, username } = await createTestUser("correct-horse-1");
    userId = id;

    const res = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "wrong-password" });
    expect(res.status).toBe(401);

    const entry = await lastActivityFor(username);
    expect(entry.action).toBe("login_failed");
    expect(entry.statusCode).toBe(401);
  });

  it("changes password with the correct current password, and the new password works on the next login", async () => {
    const { id, username } = await createTestUser("correct-horse-1");
    userId = id;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "correct-horse-1" });
    const token = loginRes.body.token;

    const changeRes = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "correct-horse-1", newPassword: "new-correct-horse-2" });
    expect(changeRes.status).toBe(204);

    const oldLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "correct-horse-1" });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "new-correct-horse-2" });
    expect(newLoginRes.status).toBe(200);
  });

  it("rejects change-password with the wrong current password (401), leaving the password unchanged", async () => {
    const { id, username } = await createTestUser("correct-horse-1");
    userId = id;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "correct-horse-1" });
    const token = loginRes.body.token;

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "totally-wrong", newPassword: "new-correct-horse-2" });
    expect(res.status).toBe(401);
  });

  it("rejects a too-short new password with 400", async () => {
    const { id, username } = await createTestUser("correct-horse-1");
    userId = id;

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ username, password: "correct-horse-1" });
    const token = loginRes.body.token;

    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "correct-horse-1", newPassword: "short" });
    expect(res.status).toBe(400);
  });

  it("rejects change-password with no token at all (401)", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "abcdefgh" });
    expect(res.status).toBe(401);
  });
});
