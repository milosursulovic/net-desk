import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import crypto from "crypto";
import { requireManagerEnrollToken, authenticateManager } from "../../middlewares/managerAuth.middleware.js";
import { MANAGER_ENROLL_TOKEN } from "../../config/env.js";
import { insertManager, findManagerById, revokeManagerById } from "../../repositories/managers.repo.js";
import { generateApiKey, hashApiKey } from "../../utils/apiKey.js";
import { pool } from "../../db/pool.js";

function reqWithAuth(headerValue) {
  return { headers: headerValue ? { authorization: headerValue } : {} };
}

async function deleteTestManager(id) {
  if (!id) return;
  await pool.execute("DELETE FROM managers WHERE id = ?", [id]);
}

describe("requireManagerEnrollToken", () => {
  it("calls next() for the correct enroll token", () => {
    const next = vi.fn();
    requireManagerEnrollToken(reqWithAuth(`Bearer ${MANAGER_ENROLL_TOKEN}`), {}, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects the wrong token", () => {
    const next = vi.fn();
    expect(() => requireManagerEnrollToken(reqWithAuth("Bearer wrong-token"), {}, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects the Agent's own enroll token (separate secrets, not interchangeable)", () => {
    const next = vi.fn();
    expect(() =>
      requireManagerEnrollToken(reqWithAuth(`Bearer ${process.env.AGENT_ENROLL_TOKEN}`), {}, next),
    ).toThrow();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authenticateManager (integration, real DB)", () => {
  let managerId;
  let managerUid;
  let apiKey;

  beforeEach(async () => {
    apiKey = generateApiKey();
    managerId = await insertManager({
      managerUid: crypto.randomUUID(),
      apiKeyHash: hashApiKey(apiKey),
      hostname: "VITEST_TEST_manager",
      managerVersion: "1.0.0",
    });
    managerUid = (await findManagerById(managerId)).managerUid;
  });

  afterEach(async () => {
    await deleteTestManager(managerId);
  });

  it("sets req.manager and calls next() for a valid managerId:apiKey pair", async () => {
    const req = reqWithAuth(`Bearer ${managerUid}:${apiKey}`);
    const next = vi.fn();
    await authenticateManager(req, {}, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.manager.id).toBe(managerId);
    expect(req.manager.managerUid).toBe(managerUid);
  });

  it("rejects a missing colon separator (no way to split uid from key)", async () => {
    const req = reqWithAuth(`Bearer ${managerUid}${apiKey}`);
    await expect(authenticateManager(req, {}, vi.fn())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an unknown managerUid", async () => {
    const req = reqWithAuth(`Bearer ${crypto.randomUUID()}:${apiKey}`);
    await expect(authenticateManager(req, {}, vi.fn())).rejects.toMatchObject({ status: 403 });
  });

  it("rejects the wrong apiKey for a real manager", async () => {
    const req = reqWithAuth(`Bearer ${managerUid}:${generateApiKey()}`);
    await expect(authenticateManager(req, {}, vi.fn())).rejects.toMatchObject({ status: 403 });
  });

  // Regression guard: crypto.timingSafeEqual THROWS (not returns false) on
  // mismatched-length buffers - a short/malformed apiKey must still resolve
  // to a clean 403, not an unhandled 500. This is the exact bug class the
  // length-check-before-timingSafeEqual guard exists to prevent.
  it("rejects a much shorter apiKey without throwing an unhandled error", async () => {
    const req = reqWithAuth(`Bearer ${managerUid}:x`);
    await expect(authenticateManager(req, {}, vi.fn())).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a revoked manager even with the correct apiKey", async () => {
    await revokeManagerById(managerId);
    const req = reqWithAuth(`Bearer ${managerUid}:${apiKey}`);
    await expect(authenticateManager(req, {}, vi.fn())).rejects.toMatchObject({ status: 403 });
  });

  it("rejects a missing Authorization header", async () => {
    await expect(authenticateManager(reqWithAuth(undefined), {}, vi.fn())).rejects.toMatchObject({
      status: 401,
    });
  });
});
