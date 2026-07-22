import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { AGENT_ENROLL_TOKEN } from "../../config/env.js";
import { adminToken } from "../helpers/authToken.js";
import {
  deleteTestAgent,
  deleteTestIpEntry,
  testIp,
  testHostname,
  testPushEndpoint,
  deleteTestPushSubscription,
} from "../helpers/testDb.js";

const app = createApp();

describe("HTTP routes (integration, real Express app + real DB)", () => {
  describe("public endpoints", () => {
    it("GET /health returns 200 ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.text).toBe("ok");
    });

    it("GET /nonexistent-route returns 404", async () => {
      const res = await request(app).get("/nonexistent-route");
      expect(res.status).toBe(404);
    });
  });

  describe("protected routes require a valid JWT", () => {
    it("rejects with 401 when no Authorization header is sent", async () => {
      const res = await request(app).get("/api/protected/agents");
      expect(res.status).toBe(401);
    });

    it("rejects with 403 for a garbage/invalid token", async () => {
      const res = await request(app)
        .get("/api/protected/agents")
        .set("Authorization", "Bearer not-a-real-token");
      expect(res.status).toBe(403);
    });

    it("accepts a valid admin JWT", async () => {
      const res = await request(app)
        .get("/api/protected/agents")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("items");
    });
  });

  describe("agent enroll endpoint", () => {
    let agentId;

    afterEach(async () => {
      await deleteTestAgent(agentId);
      agentId = undefined;
    });

    it("rejects enrollment with the wrong enroll token", async () => {
      const res = await request(app)
        .post("/api/agents/enroll")
        .set("Authorization", "Bearer wrong-token")
        .send({ hostname: testHostname() });
      expect(res.status).toBe(401);
    });

    it("enrolls a real agent end-to-end over real HTTP", async () => {
      const hostname = testHostname();
      const res = await request(app)
        .post("/api/agents/enroll")
        .set("Authorization", `Bearer ${AGENT_ENROLL_TOKEN}`)
        .send({ hostname, osCaption: "Windows 10 Pro", agentVersion: "1.0.0" });

      expect(res.status).toBe(201);
      expect(res.body.agentId).toBeTruthy();
      expect(res.body.apiKey).toMatch(/^[0-9a-f]{64}$/);

      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(res.body.agentId);
      agentId = found.id;
      expect(found).toBeTruthy();
    });
  });

  describe(
    "route ordering: /agents/without-agent-computers must not be swallowed by /agents/:id " +
      "(regression - this route was deliberately placed before the :id route)",
    () => {
      it("resolves to the without-agent-computers list, not a parseIdParam 400", async () => {
        const res = await request(app)
          .get("/api/protected/agents/without-agent-computers")
          .set("Authorization", `Bearer ${adminToken()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("entries");
      });
    },
  );

  describe("ip-addresses CRUD over real HTTP", () => {
    let entryId;

    afterEach(async () => {
      await deleteTestIpEntry(entryId);
      entryId = undefined;
    });

    it("creates, fetches, and deletes an ip entry through the full HTTP stack", async () => {
      const ip = testIp();
      const token = adminToken();

      const createRes = await request(app)
        .post("/api/protected/ip-addresses")
        .set("Authorization", `Bearer ${token}`)
        .send({ ip, computerName: "HTTP-TEST-PC", entryType: "computer" });
      expect(createRes.status).toBe(201);
      entryId = createRes.body.id;

      const getRes = await request(app)
        .get(`/api/protected/ip-addresses/${entryId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.ip).toBe(ip);

      const deleteRes = await request(app)
        .delete(`/api/protected/ip-addresses/${entryId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(deleteRes.status).toBe(200);

      const getAfterDeleteRes = await request(app)
        .get(`/api/protected/ip-addresses/${entryId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(getAfterDeleteRes.status).toBe(404);

      entryId = undefined; // already deleted, nothing left to clean up
    });

    it(
      "rejects creating an entry with an invalid IP with 400, not 500 " +
        "(regression: createController used to call UpsertIpSchema.parse() directly, " +
        "which throws a raw ZodError that errorHandler doesn't special-case - it has " +
        "no .status, so it fell through to the 500 default)",
      async () => {
        const res = await request(app)
          .post("/api/protected/ip-addresses")
          .set("Authorization", `Bearer ${adminToken()}`)
          .send({ ip: "not-an-ip" });
        expect(res.status).toBe(400);
      },
    );

    it("rejects an invalid sortBy query value with 400, not 500 (same class of bug, on the list endpoint)", async () => {
      const res = await request(app)
        .get("/api/protected/ip-addresses?sortBy=1;%20DROP%20TABLE%20ip_entries")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(400);
    });
  });

  describe("push subscription endpoints", () => {
    let endpoint;

    afterEach(async () => {
      await deleteTestPushSubscription(endpoint);
      endpoint = undefined;
    });

    it("returns the VAPID public key", async () => {
      const res = await request(app)
        .get("/api/protected/push/public-key")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("publicKey");
    });

    it("subscribes, upserts on re-subscribe, then unsubscribes through the full HTTP stack", async () => {
      endpoint = testPushEndpoint();
      const token = adminToken();

      const subscribeRes = await request(app)
        .post("/api/protected/push/subscribe")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint, keys: { p256dh: "test-p256dh", auth: "test-auth" } });
      expect(subscribeRes.status).toBe(201);

      const { pool } = await import("../../db/pool.js");
      const [[row]] = await pool.query(
        "SELECT p256dh FROM push_subscriptions WHERE endpoint = ?",
        [endpoint],
      );
      expect(row.p256dh).toBe("test-p256dh");

      // Re-subscribing with the same endpoint (browser re-registers the same
      // push registration) must update, not conflict/duplicate.
      const resubscribeRes = await request(app)
        .post("/api/protected/push/subscribe")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint, keys: { p256dh: "updated-p256dh", auth: "updated-auth" } });
      expect(resubscribeRes.status).toBe(201);

      const [[updatedRow]] = await pool.query(
        "SELECT p256dh FROM push_subscriptions WHERE endpoint = ?",
        [endpoint],
      );
      expect(updatedRow.p256dh).toBe("updated-p256dh");

      const unsubscribeRes = await request(app)
        .post("/api/protected/push/unsubscribe")
        .set("Authorization", `Bearer ${token}`)
        .send({ endpoint });
      expect(unsubscribeRes.status).toBe(200);

      const [rowsAfterDelete] = await pool.query(
        "SELECT * FROM push_subscriptions WHERE endpoint = ?",
        [endpoint],
      );
      expect(rowsAfterDelete).toHaveLength(0);

      endpoint = undefined; // already deleted, nothing left to clean up
    });

    it("rejects a subscribe payload with an invalid endpoint URL with 400, not 500", async () => {
      const res = await request(app)
        .post("/api/protected/push/subscribe")
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ endpoint: "not-a-url", keys: { p256dh: "x", auth: "y" } });
      expect(res.status).toBe(400);
    });
  });
});
