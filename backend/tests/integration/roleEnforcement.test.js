import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { createApp } from "../../app.js";
import { JWT_SECRET } from "../../config/env.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { createUser } from "../../repositories/users.repo.js";
import { insertAgent } from "../../repositories/agents.repo.js";
import { generateDailyReportsForAllSites } from "../../services/dailyReport.service.js";
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
  let reportIds = [];
  let realUserId;

  afterEach(async () => {
    await deleteTestIpEntry(entryId);
    entryId = undefined;
    await deleteTestPushSubscription(pushEndpoint);
    pushEndpoint = undefined;
    await Promise.all(reportIds.map((id) => deleteTestDailyReport(id)));
    reportIds = [];
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
      .send({ ip: testIp(), computerName: "ROLE-TEST-PC", site: "bolnica", entryType: "computer" });
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

  it("viewer IS allowed to mark a report as read (personal action, not a data mutation)", async () => {
    // Generisanje izveštaja više nema HTTP rutu (samo cron, videti
    // dailyReportScheduler.js) - ovaj test ionako testira mark-read
    // dozvole, ne generisanje samo, pa poziva servis direktno da napravi
    // izveštaj za setup.
    const generated = await generateDailyReportsForAllSites();
    reportIds = generated.map((r) => r.id);
    reportId = reportIds[0];

    const res = await request(app)
      .post(`/api/protected/reports/${reportId}/mark-read`)
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.openedAt).not.toBeNull();
  });

  describe("delete routes require admin (operator can create/update but not delete)", () => {
    // requireRole runs before the controller, so it 403s before any DB
    // lookup - a nonexistent id is enough to exercise the role gate itself.
    const deleteRoutes = [
      "/api/protected/inventory/999999999",
      "/api/protected/ip-addresses/999999999",
      "/api/protected/pdsu/999999999",
      "/api/protected/metadata/999999999",
      "/api/protected/printers/999999999",
      "/api/protected/agents/999999999/jobs",
      "/api/protected/flagged/services/999999999",
    ];

    it.each(deleteRoutes)("operator is blocked (403) from DELETE %s", async (path) => {
      const res = await request(app)
        .delete(path)
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(res.status).toBe(403);
    });

    it.each(deleteRoutes)("viewer is blocked (403) from DELETE %s", async (path) => {
      const res = await request(app)
        .delete(path)
        .set("Authorization", `Bearer ${viewerToken()}`);
      expect(res.status).toBe(403);
    });
  });

  describe("agent revoke/deployment-group require admin (operator blocked)", () => {
    it("operator is blocked (403) from revoking an agent", async () => {
      const res = await request(app)
        .post("/api/protected/agents/999999999/revoke")
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(res.status).toBe(403);
    });

    it("operator is blocked (403) from adding an agent's deployment group", async () => {
      const res = await request(app)
        .post("/api/protected/agents/999999999/deployment-groups")
        .set("Authorization", `Bearer ${operatorToken()}`)
        .send({ groupName: "rest" });
      expect(res.status).toBe(403);
    });

    it("operator is blocked (403) from removing an agent's deployment group", async () => {
      const res = await request(app)
        .delete("/api/protected/agents/999999999/deployment-groups/rest")
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(res.status).toBe(403);
    });

    it("operator is blocked (403) from batch-assigning a deployment group", async () => {
      const res = await request(app)
        .post("/api/protected/agents/deployment-groups/batch")
        .set("Authorization", `Bearer ${operatorToken()}`)
        .send({ agentIds: [999999999], groupName: "rest" });
      expect(res.status).toBe(403);
    });
  });

  describe("operator-readable, admin-only-write modules (dns-logs, process-detections)", () => {
    it("operator can read dns-logs and process-detections, viewer is blocked", async () => {
      const dnsOperator = await request(app)
        .get("/api/protected/dns-logs")
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(dnsOperator.status).toBe(200);

      const dnsViewer = await request(app)
        .get("/api/protected/dns-logs")
        .set("Authorization", `Bearer ${viewerToken()}`);
      expect(dnsViewer.status).toBe(403);

      const procOperator = await request(app)
        .get("/api/protected/process-detections")
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(procOperator.status).toBe(200);

      const procViewer = await request(app)
        .get("/api/protected/process-detections")
        .set("Authorization", `Bearer ${viewerToken()}`);
      expect(procViewer.status).toBe(403);
    });

    it("operator is blocked (403) from writing to the DNS blacklist (add or remove)", async () => {
      const addRes = await request(app)
        .post("/api/protected/dns-logs/blacklist")
        .set("Authorization", `Bearer ${operatorToken()}`)
        .send({ domain: "vitest-role-test.example.com" });
      expect(addRes.status).toBe(403);

      const delRes = await request(app)
        .delete("/api/protected/dns-logs/blacklist/999999999")
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(delRes.status).toBe(403);
    });
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
