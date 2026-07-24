import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import http from "http";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import WebSocket from "ws";
import { createApp } from "../../app.js";
import { attachVncRelay } from "../../ws/vncRelay.js";
import { JWT_SECRET } from "../../config/env.js";
import { insertAgent } from "../../repositories/agents.repo.js";
import { generateApiKey, hashApiKey } from "../../utils/apiKey.js";
import { insertVncSession } from "../../repositories/vncSessions.repo.js";
import { pool } from "../../db/pool.js";
import { deleteTestAgent, testHostname } from "../helpers/testDb.js";

// Plain http (not https) for this test server - the relay logic itself is
// transport-agnostic, and this avoids any dev-cert dependency just to
// exercise the WebSocket upgrade/relay wiring.
let server;
let baseUrl;

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  attachVncRelay(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function adminJwt() {
  return jwt.sign({ userId: 1, username: "vitest-admin", role: "admin" }, JWT_SECRET, {
    expiresIn: "1h",
    algorithm: "HS256",
  });
}

async function deleteTestVncSession(id) {
  if (!id) return;
  await pool.execute("DELETE FROM vnc_sessions WHERE id = ?", [id]);
}

function waitForOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once("message", (data, isBinary) => resolve({ data, isBinary }));
  });
}

function waitForClose(ws) {
  return new Promise((resolve) => ws.once("close", resolve));
}

describe("VNC relay (integration, real DB + real WebSocket server)", () => {
  let agentId;
  let agentUid;
  let apiKey;
  let sessionId;

  afterEach(async () => {
    await deleteTestVncSession(sessionId);
    sessionId = undefined;
    await deleteTestAgent(agentId);
    agentId = undefined;
  });

  it("relays a binary frame from agent to viewer, and a JSON input event from viewer to agent", async () => {
    apiKey = generateApiKey();
    agentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: hashApiKey(apiKey),
      hostname: testHostname(),
      osCaption: null,
      osVersion: null,
      osBuild: null,
      agentVersion: null,
    });
    const { findAgentById } = await import("../../repositories/agents.repo.js");
    agentUid = (await findAgentById(agentId)).agentUid;

    sessionId = await insertVncSession({ agentId, requestedByUserId: null });

    const viewerWs = new WebSocket(`${baseUrl}/api/protected/vnc-stream/${sessionId}?token=${adminJwt()}`);
    const agentWs = new WebSocket(`${baseUrl}/api/agents/vnc-stream?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${agentUid}:${apiKey}` },
    });

    try {
      await Promise.all([waitForOpen(viewerWs), waitForOpen(agentWs)]);

      const fakeFrame = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]);
      const viewerReceived = waitForMessage(viewerWs);
      agentWs.send(fakeFrame);
      const { data: frameData, isBinary } = await viewerReceived;
      expect(isBinary).toBe(true);
      expect(Buffer.from(frameData).equals(fakeFrame)).toBe(true);

      const inputEvent = JSON.stringify({ type: "mousemove", x: 0.5, y: 0.5 });
      const agentReceived = waitForMessage(agentWs);
      viewerWs.send(inputEvent);
      const { data: inputData } = await agentReceived;
      expect(inputData.toString()).toBe(inputEvent);
    } finally {
      viewerWs.close();
      agentWs.close();
    }
  });

  it("closing the viewer side also closes the paired agent socket and marks the session ended", async () => {
    apiKey = generateApiKey();
    agentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: hashApiKey(apiKey),
      hostname: testHostname(),
      osCaption: null,
      osVersion: null,
      osBuild: null,
      agentVersion: null,
    });
    const { findAgentById } = await import("../../repositories/agents.repo.js");
    agentUid = (await findAgentById(agentId)).agentUid;

    sessionId = await insertVncSession({ agentId, requestedByUserId: null });

    const viewerWs = new WebSocket(`${baseUrl}/api/protected/vnc-stream/${sessionId}?token=${adminJwt()}`);
    const agentWs = new WebSocket(`${baseUrl}/api/agents/vnc-stream?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${agentUid}:${apiKey}` },
    });
    await Promise.all([waitForOpen(viewerWs), waitForOpen(agentWs)]);

    const agentClosed = waitForClose(agentWs);
    viewerWs.close();
    await agentClosed;

    const [rows] = await pool.query("SELECT status FROM vnc_sessions WHERE id = ?", [sessionId]);
    expect(rows[0].status).toBe("ended");
  });

  it("rejects an agent connection with the wrong API key", async () => {
    apiKey = generateApiKey();
    agentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: hashApiKey(apiKey),
      hostname: testHostname(),
      osCaption: null,
      osVersion: null,
      osBuild: null,
      agentVersion: null,
    });
    const { findAgentById } = await import("../../repositories/agents.repo.js");
    agentUid = (await findAgentById(agentId)).agentUid;
    sessionId = await insertVncSession({ agentId, requestedByUserId: null });

    const badAgentWs = new WebSocket(`${baseUrl}/api/agents/vnc-stream?sessionId=${sessionId}`, {
      headers: { Authorization: `Bearer ${agentUid}:wrong-key` },
    });

    await expect(waitForOpen(badAgentWs)).rejects.toBeTruthy();
  });

  it("rejects a viewer connection with an invalid/missing token", async () => {
    apiKey = generateApiKey();
    agentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: hashApiKey(apiKey),
      hostname: testHostname(),
      osCaption: null,
      osVersion: null,
      osBuild: null,
      agentVersion: null,
    });
    sessionId = await insertVncSession({ agentId, requestedByUserId: null });

    const badViewerWs = new WebSocket(`${baseUrl}/api/protected/vnc-stream/${sessionId}`);
    await expect(waitForOpen(badViewerWs)).rejects.toBeTruthy();
  });
});
