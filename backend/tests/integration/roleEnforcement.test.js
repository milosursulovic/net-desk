import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createApp } from "../../app.js";
import { JWT_SECRET } from "../../config/env.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { createUser } from "../../repositories/users.repo.js";
import { insertAgent } from "../../repositories/agents.repo.js";
import {
  testIp,
  deleteTestIpEntry,
  testPushEndpoint,
  deleteTestPushSubscription,
  deleteTestDailyReport,
  testUsername,
  deleteTestUser,
  deleteTestAgent,
  testHostname,
} from "../helpers/testDb.js";

const app = createApp();

// push_subscriptions.user_id has a real FK to users.id - the generic
// viewerToken()/operatorToken() helpers use made-up ids that don't exist as
// actual rows, which is fine for FK-free routes but violates the constraint
// here. This mints a token for an actual, temporary DB user instead.
async function tokenForRealUser(role) {
  const id = await createUser({
    username: testUsername(),
    passwordHash: "unused",
    role,
  });
  const token = jwt.sign({ userId: id, username: "vitest-real", role }, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
  return { id, token };
}

describe("role enforcement across modules (integration, real DB)", () => {
  let entryId;
  let pushEndpoint;
  let reportId;
  let realUserId;

  afterEach(async () => {
    await deleteTestIpEntry(entryId);
    entryId = undefined;
    await deleteTestPushSubscription(pushEndpoint);
    pushEndpoint = undefined;
    await deleteTestDailyReport(reportId);
    reportId = undefined;
    await deleteTestUser(realUserId);
    realUserId = undefined;
  });

  it("viewer is blocked (403) from writing to a default-policy module (ip-addresses)", async () => {
    const res = await request(app)
      .post("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ ip: testIp(), computerName: "ROLE-TEST-PC", entryType: "computer" });
    expect(res.status).toBe(403);
  });

  it("viewer CAN still read a default-policy module (GET stays open to every role)", async () => {
    const res = await request(app)
      .get("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(200);
  });

  it("operator IS allowed to write to a default-policy module (ip-addresses)", async () => {
    const res = await request(app)
      .post("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ ip: testIp(), computerName: "ROLE-TEST-PC", entryType: "computer" });
    expect(res.status).toBe(201);
    entryId = res.body.id;
  });

  it("operator is blocked (403) from an admin-only module (agent-releases)", async () => {
    const res = await request(app)
      .post("/api/protected/agent-releases")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .field("version", "9.9.9");
    expect(res.status).toBe(403);
  });

  it("viewer is blocked (403) from an admin-only module (agent-releases)", async () => {
    const res = await request(app)
      .post("/api/protected/agent-releases")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .field("version", "9.9.9");
    expect(res.status).toBe(403);
  });

  it("viewer IS allowed to subscribe/unsubscribe push (personal action, not a data mutation)", async () => {
    const { id, token } = await tokenForRealUser("viewer");
    realUserId = id;
    pushEndpoint = testPushEndpoint();

    const res = await request(app)
      .post("/api/protected/push/subscribe")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: pushEndpoint, keys: { p256dh: "test", auth: "test" } });
    expect(res.status).toBe(201);
  });

  it("viewer is blocked (403) from generating a new daily report", async () => {
    const res = await request(app)
      .post("/api/protected/reports/generate")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(403);
  });

  it("viewer IS allowed to mark a report as read (personal action, not a data mutation)", async () => {
    const genRes = await request(app)
      .post("/api/protected/reports/generate")
      .set("Authorization", `Bearer ${adminToken()}`);
    reportId = genRes.body.id;

    const res = await request(app)
      .post(`/api/protected/reports/${reportId}/mark-read`)
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.openedAt).not.toBeNull();
  });

  describe("batch job endpoint (POST /agents/jobs/batch)", () => {
    let agentId;

    afterEach(async () => {
      await deleteTestAgent(agentId);
      agentId = undefined;
    });

    it("viewer is blocked (403) from dispatching a batch job", async () => {
      const res = await request(app)
        .post("/api/protected/agents/jobs/batch")
        .set("Authorization", `Bearer ${viewerToken()}`)
        .send({ commandType: "delete_temp_files", agentIds: [1] });
      expect(res.status).toBe(403);
    });

    it("operator can dispatch a batch job across multiple agents", async () => {
      agentId = await insertAgent({
        agentUid: crypto.randomUUID(),
        apiKeyHash: "test-hash",
        hostname: testHostname(),
        osCaption: null,
        osVersion: null,
        osBuild: null,
        agentVersion: null,
      });
      // agent_jobs.created_by_user_id has a real FK to users.id -
      // operatorToken()'s made-up userId would violate it here (unlike
      // routes with no such FK), so this needs a real, temporary DB user.
      const { id, token } = await tokenForRealUser("operator");
      realUserId = id;

      const res = await request(app)
        .post("/api/protected/agents/jobs/batch")
        .set("Authorization", `Bearer ${token}`)
        .send({ commandType: "delete_temp_files", agentIds: [agentId, 999999999] });
      expect(res.status).toBe(201);
      expect(res.body.created).toHaveLength(1);
      expect(res.body.skipped).toHaveLength(1);
    });

    it("rejects an empty agentIds array with 400", async () => {
      const res = await request(app)
        .post("/api/protected/agents/jobs/batch")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ commandType: "delete_temp_files", agentIds: [] });
      expect(res.status).toBe(400);
    });
  });
});
