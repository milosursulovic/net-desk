import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { requireEnrollToken, authenticateAgent } from "../../middlewares/agentAuth.middleware.js";
import { AGENT_ENROLL_TOKEN } from "../../config/env.js";
import { insertAgent, revokeAgentById } from "../../repositories/agents.repo.js";
import { generateApiKey, hashApiKey } from "../../utils/apiKey.js";
import { deleteTestAgent, testHostname } from "../helpers/testDb.js";

function reqWithAuth(headerValue) {
  return { headers: headerValue ? { authorization: headerValue } : {} };
}

describe("requireEnrollToken", () => {
  it("calls next() for the correct enroll token", () => {
    const next = vi.fn();
    requireEnrollToken(reqWithAuth(`Bearer ${AGENT_ENROLL_TOKEN}`), {}, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a missing Authorization header", () => {
    const next = vi.fn();
    expect(() => requireEnrollToken(reqWithAuth(undefined), {}, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects the wrong token", () => {
    const next = vi.fn();
    expect(() => requireEnrollToken(reqWithAuth("Bearer wrong-token"), {}, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a non-Bearer scheme", () => {
    const next = vi.fn();
    expect(() =>
      requireEnrollToken(reqWithAuth(`Basic ${AGENT_ENROLL_TOKEN}`), {}, next),
    ).toThrow();
  });
});

describe("authenticateAgent (integration, real DB)", () => {
  let agentId;
  let agentUid;
  let apiKey;

  beforeEach(async () => {
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
  });

  afterEach(async () => {
    await deleteTestAgent(agentId);
  });

  it("sets req.agent and calls next() for a valid agentId:apiKey pair", async () => {
    const req = reqWithAuth(`Bearer ${agentUid}:${apiKey}`);
    const next = vi.fn();
    await authenticateAgent(req, {}, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.agent.id).toBe(agentId);
    expect(req.agent.agentUid).toBe(agentUid);
  });

  it("rejects a missing colon separator (no way to split uid from key)", async () => {
    const req = reqWithAuth(`Bearer ${agentUid}${apiKey}`);
    await expect(authenticateAgent(req, {}, vi.fn())).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects an unknown agentUid", async () => {
    const req = reqWithAuth(`Bearer ${crypto.randomUUID()}:${apiKey}`);
    await expect(authenticateAgent(req, {}, vi.fn())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects the wrong apiKey for a real agent", async () => {
    const req = reqWithAuth(`Bearer ${agentUid}:${generateApiKey()}`);
    await expect(authenticateAgent(req, {}, vi.fn())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects a revoked agent even with the correct apiKey", async () => {
    await revokeAgentById(agentId);
    const req = reqWithAuth(`Bearer ${agentUid}:${apiKey}`);
    await expect(authenticateAgent(req, {}, vi.fn())).rejects.toMatchObject({
      status: 403,
    });
  });

  it("rejects a missing Authorization header", async () => {
    await expect(
      authenticateAgent(reqWithAuth(undefined), {}, vi.fn()),
    ).rejects.toMatchObject({ status: 401 });
  });
});
