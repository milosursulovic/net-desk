import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
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
  deleteTestDailyReport,
} from "../helpers/testDb.js";

const app = createApp();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST_BUILT = fs.existsSync(
  path.join(__dirname, "../../../frontend/dist/index.html"),
);

describe("HTTP routes (integration, real Express app + real DB)", () => {
  describe("public endpoints", () => {
    it("GET /health returns 200 ok", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.text).toBe("ok");
    });

    it("GET /api/nonexistent-route always returns 404, regardless of whether frontend/dist is built (the SPA fallback in app.js explicitly excludes /api/*)", async () => {
      const res = await request(app).get("/api/nonexistent-route");
      expect(res.status).toBe(404);
    });

    it(
      FRONTEND_DIST_BUILT
        ? "GET /nonexistent-route serves the SPA shell (index.html) so Vue Router's own catch-all can 404 client-side"
        : "GET /nonexistent-route returns 404 (frontend/dist not built in this environment - app.js's SPA fallback is conditional on it existing)",
      async () => {
        const res = await request(app).get("/nonexistent-route");
        if (FRONTEND_DIST_BUILT) {
          expect(res.status).toBe(200);
          expect(res.text).toContain("<div id=\"app\">");
        } else {
          expect(res.status).toBe(404);
        }
      },
    );
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

  describe(
    "route ordering: /agents/filter-options must not be swallowed by /agents/:id " +
      "(same regression class as without-agent-computers above)",
    () => {
      it("resolves to the filter-options list, not a parseIdParam 400", async () => {
        const res = await request(app)
          .get("/api/protected/agents/filter-options")
          .set("Authorization", `Bearer ${adminToken()}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("os");
        expect(Array.isArray(res.body.os)).toBe(true);
      });
    },
  );

  describe("agents list accepts the new detailed filter query params without erroring", () => {
    it("ignores an invalid connectivityStatus/deploymentGroup instead of 500ing", async () => {
      const res = await request(app)
        .get(
          "/api/protected/agents?connectivityStatus=bogus&deploymentGroup=bogus&enrolledFrom=not-a-date",
        )
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("items");
    });

    it("accepts a valid combination of connectivityStatus/deploymentGroup/date range", async () => {
      const res = await request(app)
        .get(
          "/api/protected/agents?connectivityStatus=offline&deploymentGroup=rest&enrolledFrom=2000-01-01&enrolledTo=2099-01-01",
        )
        .set("Authorization", `Bearer ${adminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("items");
    });
  });

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

  describe(
    "route ordering: /reports/latest and /reports/generate must not be swallowed by " +
      "/reports/:id (same regression class as the agents route-ordering tests above)",
    () => {
      let reportId;

      afterEach(async () => {
        await deleteTestDailyReport(reportId);
        reportId = undefined;
      });

      it("GET /reports/latest resolves to the latest-report lookup, not a parseIdParam 400", async () => {
        const res = await request(app)
          .get("/api/protected/reports/latest")
          .set("Authorization", `Bearer ${adminToken()}`);

        // 200 if a report already exists, 404 if none do yet - either way it
        // must be the "no report found" 404, not a "bad :id" 400.
        expect([200, 404]).toContain(res.status);
      });

      it("POST /reports/generate resolves to report generation, not a parseIdParam 400", async () => {
        const res = await request(app)
          .post("/api/protected/reports/generate")
          .set("Authorization", `Bearer ${adminToken()}`);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty("content");
        reportId = res.body.id;
      });
    },
  );

  describe("reports endpoints over real HTTP", () => {
    let reportId;

    afterEach(async () => {
      await deleteTestDailyReport(reportId);
      reportId = undefined;
    });

    it("generates a report, fetches it by id, and lists it", async () => {
      const token = adminToken();

      const genRes = await request(app)
        .post("/api/protected/reports/generate")
        .set("Authorization", `Bearer ${token}`);
      expect(genRes.status).toBe(201);
      reportId = genRes.body.id;

      const getRes = await request(app)
        .get(`/api/protected/reports/${reportId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(reportId);

      const listRes = await request(app)
        .get("/api/protected/reports?limit=50")
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.items.map((r) => r.id)).toContain(reportId);
    });

    it("rejects an unknown report id with 404, not 500", async () => {
      const res = await request(app)
        .get("/api/protected/reports/999999999")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });

    it("mark-read sets openedAt, and a GET afterwards reflects it (GET itself has no side effect)", async () => {
      const token = adminToken();

      const genRes = await request(app)
        .post("/api/protected/reports/generate")
        .set("Authorization", `Bearer ${token}`);
      reportId = genRes.body.id;
      expect(genRes.body.openedAt).toBeNull();

      const beforeRes = await request(app)
        .get(`/api/protected/reports/${reportId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(beforeRes.body.openedAt).toBeNull();

      const markRes = await request(app)
        .post(`/api/protected/reports/${reportId}/mark-read`)
        .set("Authorization", `Bearer ${token}`);
      expect(markRes.status).toBe(200);
      expect(markRes.body.openedAt).not.toBeNull();

      const afterRes = await request(app)
        .get(`/api/protected/reports/${reportId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(afterRes.body.openedAt).not.toBeNull();
    });

    it("rejects marking an unknown report id as read with 404, not 500", async () => {
      const res = await request(app)
        .post("/api/protected/reports/999999999/mark-read")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });

    it("GET /reports/:id/pdf streams a real PDF, not JSON", async () => {
      const token = adminToken();

      const genRes = await request(app)
        .post("/api/protected/reports/generate")
        .set("Authorization", `Bearer ${token}`);
      reportId = genRes.body.id;

      const pdfRes = await request(app)
        .get(`/api/protected/reports/${reportId}/pdf`)
        .set("Authorization", `Bearer ${token}`)
        .buffer(true)
        .parse((res, callback) => {
          res.setEncoding("binary");
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => callback(null, Buffer.from(data, "binary")));
        });

      expect(pdfRes.status).toBe(200);
      expect(pdfRes.headers["content-type"]).toBe("application/pdf");
      expect(pdfRes.body.subarray(0, 5).toString()).toBe("%PDF-");
    });

    it("rejects a PDF request for an unknown report id with 404, not 500", async () => {
      const res = await request(app)
        .get("/api/protected/reports/999999999/pdf")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });
  });
});
