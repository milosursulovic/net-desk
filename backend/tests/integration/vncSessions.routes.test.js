import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import { createApp } from "../../app.js";
import { adminToken, viewerToken } from "../helpers/authToken.js";
import { insertAgent, revokeAgentById } from "../../repositories/agents.repo.js";
import { deleteTestAgent, testHostname } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";
import { upsertSetting } from "../../repositories/appSettings.repo.js";

const app = createApp();

// This file's tests exercise session lifecycle assuming the feature is on -
// gating itself (vnc_enabled=false) is covered separately below. Restored
// to the real default (off) afterward so later test files see a clean slate
// (vitest.config.js disables file parallelism, so this can't race).
beforeAll(async () => {
  await upsertSetting("vnc_enabled", "true", null);
});
afterAll(async () => {
  await pool.execute("DELETE FROM app_settings WHERE setting_key = 'vnc_enabled'");
});

async function insertTestAgent() {
  return await insertAgent({
    agentUid: crypto.randomUUID(),
    apiKeyHash: "test-hash",
    hostname: testHostname(),
    osCaption: null,
    osVersion: null,
    osBuild: null,
    agentVersion: null,
  });
}

async function deleteTestVncSession(id) {
  if (!id) return;
  await pool.execute("DELETE FROM vnc_sessions WHERE id = ?", [id]);
}

describe("vnc session routes (integration, real DB)", () => {
  let agentId;
  let sessionId;

  afterEach(async () => {
    await deleteTestVncSession(sessionId);
    sessionId = undefined;
    await deleteTestAgent(agentId);
    agentId = undefined;
  });

  it("viewer is blocked (403) from starting a VNC session", async () => {
    agentId = await insertTestAgent();
    const res = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/start`)
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(403);
  });

  it("admin can start a VNC session, which also creates a start_vnc_stream job", async () => {
    // adminToken()'s userId (1) is a real seeded row - operatorToken()'s
    // made-up id would violate vnc_sessions/activity_log's FK to users.id.
    agentId = await insertTestAgent();
    const res = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/start`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.agentId).toBe(agentId);
    sessionId = res.body.id;

    const [jobs] = await pool.query(
      "SELECT command_type AS commandType, payload FROM agent_jobs WHERE agent_id = ? ORDER BY id DESC LIMIT 1",
      [agentId],
    );
    expect(jobs[0].commandType).toBe("start_vnc_stream");
    const payload = typeof jobs[0].payload === "string" ? JSON.parse(jobs[0].payload) : jobs[0].payload;
    expect(payload.sessionId).toBe(sessionId);
  });

  it("refuses to start a session for a revoked (non-active) agent", async () => {
    agentId = await insertTestAgent();
    await revokeAgentById(agentId);

    const res = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/start`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it("refuses to start a session for an unknown agent with 404", async () => {
    const res = await request(app)
      .post("/api/protected/agents/999999999/vnc/start")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("admin/operator can end a session", async () => {
    agentId = await insertTestAgent();
    const startRes = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/start`)
      .set("Authorization", `Bearer ${adminToken()}`);
    sessionId = startRes.body.id;

    const stopRes = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/stop`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ sessionId });
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.status).toBe("ended");
    expect(stopRes.body.endedAt).not.toBeNull();
  });

  it("rejects stopping an unknown session id with 404", async () => {
    agentId = await insertTestAgent();
    const res = await request(app)
      .post(`/api/protected/agents/${agentId}/vnc/stop`)
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ sessionId: 999999999 });
    expect(res.status).toBe(404);
  });

  it("refuses to start a session (403) when vnc_enabled is turned off, even for an admin", async () => {
    agentId = await insertTestAgent();
    await upsertSetting("vnc_enabled", "false", null);

    try {
      const res = await request(app)
        .post(`/api/protected/agents/${agentId}/vnc/start`)
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(403);
    } finally {
      // Restore for the rest of this file's tests.
      await upsertSetting("vnc_enabled", "true", null);
    }
  });
});
