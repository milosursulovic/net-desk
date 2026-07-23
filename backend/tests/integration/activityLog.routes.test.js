import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createApp } from "../../app.js";
import { JWT_SECRET } from "../../config/env.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { createUser } from "../../repositories/users.repo.js";
import { testIp, deleteTestIpEntry, testUsername, deleteTestUser } from "../helpers/testDb.js";

const app = createApp();

// activity_log.user_id has a real FK to users.id - the generic
// operatorToken()/viewerToken() helpers use made-up ids that don't exist as
// actual rows, so the audit insert (correctly) fails its FK check and gets
// silently swallowed. Tests that need a log entry to actually land use a
// real, temporary DB user instead.
async function tokenForRealUser(role) {
  const username = testUsername();
  const passwordHash = await bcrypt.hash("unused-test-password", 10);
  const id = await createUser({ username, passwordHash, role });
  const token = jwt.sign({ userId: id, username, role }, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
  return { id, username, token };
}

describe("activity-log routes (integration, real DB)", () => {
  let entryId;
  let realUserId;

  afterEach(async () => {
    await deleteTestIpEntry(entryId);
    entryId = undefined;
    await deleteTestUser(realUserId);
    realUserId = undefined;
  });

  it("rejects non-admin roles with 403", async () => {
    for (const token of [operatorToken(), viewerToken()]) {
      const res = await request(app)
        .get("/api/protected/activity-log")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("admin can list activity log entries with the expected pagination shape", async () => {
    const res = await request(app)
      .get("/api/protected/activity-log")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("totalPages");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("a mutating request by a real user shows up in the activity log", async () => {
    const { id, username, token } = await tokenForRealUser("operator");
    realUserId = id;
    const ip = testIp();

    const createRes = await request(app)
      .post("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ip, computerName: "AUDIT-TEST-PC", entryType: "computer" });
    expect(createRes.status).toBe(201);
    entryId = createRes.body.id;

    const logRes = await request(app)
      .get("/api/protected/activity-log?limit=200")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(logRes.status).toBe(200);

    const match = logRes.body.items.find(
      (e) => e.action === "POST /api/protected/ip-addresses" && e.username === username,
    );
    expect(match).toBeTruthy();
    expect(match.statusCode).toBe(201);
  });

  it("GET requests are not logged (reads aren't audited actions)", async () => {
    const token = adminToken();

    await request(app)
      .get("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${token}`);

    const logRes = await request(app)
      .get("/api/protected/activity-log?limit=200")
      .set("Authorization", `Bearer ${token}`);

    const match = logRes.body.items.find(
      (e) => e.action === "GET /api/protected/ip-addresses",
    );
    expect(match).toBeUndefined();
  });

  it("filters by username", async () => {
    const { id, username, token } = await tokenForRealUser("operator");
    realUserId = id;
    const ip = testIp();

    const createRes = await request(app)
      .post("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${token}`)
      .send({ ip, computerName: "AUDIT-TEST-PC", entryType: "computer" });
    entryId = createRes.body.id;

    const res = await request(app)
      .get(`/api/protected/activity-log?username=${username}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.username).toContain(username);
    }
  });
});
