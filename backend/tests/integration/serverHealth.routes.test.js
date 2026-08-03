import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { pool } from "../../db/pool.js";

const app = createApp();

describe("server health routes (integration, real DB)", () => {
  it("rejects viewer with 403 (not operator-readable-by-viewer)", async () => {
    const liveRes = await request(app)
      .get("/api/protected/server-health/live")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(liveRes.status).toBe(403);

    const historyRes = await request(app)
      .get("/api/protected/server-health/history")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(historyRes.status).toBe(403);
  });

  it("operator can read live/history, but not run the destructive ghost-cleanup", async () => {
    const liveRes = await request(app)
      .get("/api/protected/server-health/live")
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(liveRes.status).toBe(200);

    const historyRes = await request(app)
      .get("/api/protected/server-health/history")
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(historyRes.status).toBe(200);

    const cleanupRes = await request(app)
      .post("/api/protected/server-health/ghost-cleanup")
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(cleanupRes.status).toBe(403);
  });

  it("admin gets a live snapshot with system/db/process/requests sections", async () => {
    const res = await request(app)
      .get("/api/protected/server-health/live")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.system).toMatchObject({
      cpuLoadPct: expect.any(Number),
      ramUsedPct: expect.any(Number),
    });
    expect(res.body.db).toMatchObject({
      threadsConnected: expect.any(Number),
      maxConnections: expect.any(Number),
      queriesPerMin: expect.any(Number),
      avgQueryMs: expect.any(Number),
      slowQueryCount: expect.any(Number),
      slowestQueries: expect.any(Array),
      size: { totalSizeMb: expect.any(Number), topTables: expect.any(Array) },
      process: { found: expect.any(Boolean) },
    });
    expect(res.body.process).toMatchObject({
      rssMb: expect.any(Number),
      heapUsedMb: expect.any(Number),
    });
    expect(res.body.requests).toMatchObject({
      requestsPerMin: expect.any(Number),
      avgResponseMs: expect.any(Number),
      p95ResponseMs: expect.any(Number),
      p99ResponseMs: expect.any(Number),
      errorRatePct: expect.any(Number),
      topRoutes: expect.any(Array),
    });
  });

  it("a request shows up in the per-route breakdown on the NEXT live read", async () => {
    await request(app)
      .get("/api/protected/ip-addresses")
      .set("Authorization", `Bearer ${adminToken()}`);

    const res = await request(app)
      .get("/api/protected/server-health/live")
      .set("Authorization", `Bearer ${adminToken()}`);

    const ownRoute = res.body.requests.topRoutes.find((r) => r.route.includes("/ip-addresses"));
    expect(ownRoute).toBeTruthy();
    expect(ownRoute.count).toBeGreaterThan(0);
  });

  it("admin can list history (empty array when nothing captured yet)", async () => {
    const res = await request(app)
      .get("/api/protected/server-health/history?hours=1")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("history reflects a captured snapshot", async () => {
    const { captureServerSnapshot } = await import("../../services/serverHealth.service.js");
    await captureServerSnapshot();

    const res = await request(app)
      .get("/api/protected/server-health/history?hours=1")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    const last = res.body.items[res.body.items.length - 1];
    expect(last).toHaveProperty("cpuLoadPct");
    expect(last).toHaveProperty("recordedAt");
    expect(last).toHaveProperty("p95ResponseMs");
    expect(last).toHaveProperty("p99ResponseMs");
    expect(last).toHaveProperty("mariadbCpuPct");
    expect(last).toHaveProperty("mariadbMemMb");

    await pool.execute("DELETE FROM server_monitoring_history");
  });
});
