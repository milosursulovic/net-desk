import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { pool } from "../../db/pool.js";

const app = createApp();

describe("app settings routes (integration, real DB)", () => {
  afterEach(async () => {
    // Restore vnc_enabled to its real default (off) so other test files
    // (e.g. vncSessions.routes.test.js) see a clean slate - vitest.config.js
    // disables file parallelism, so this can't race.
    await pool.execute("DELETE FROM app_settings WHERE setting_key = 'vnc_enabled'");
  });

  it("rejects non-admin roles with 403", async () => {
    for (const token of [operatorToken(), viewerToken()]) {
      const getRes = await request(app)
        .get("/api/protected/settings")
        .set("Authorization", `Bearer ${token}`);
      expect(getRes.status).toBe(403);

      const patchRes = await request(app)
        .patch("/api/protected/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ key: "some_setting", value: true });
      expect(patchRes.status).toBe(403);
    }
  });

  it("admin gets the registered settings, defaulting to off", async () => {
    const res = await request(app)
      .get("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ key: "vnc_enabled", value: false }),
    ]);
  });

  it("admin can toggle a registered setting on and off", async () => {
    const onRes = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ key: "vnc_enabled", value: true });
    expect(onRes.status).toBe(200);
    expect(onRes.body.find((s) => s.key === "vnc_enabled").value).toBe(true);

    const offRes = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ key: "vnc_enabled", value: false });
    expect(offRes.status).toBe(200);
    expect(offRes.body.find((s) => s.key === "vnc_enabled").value).toBe(false);
  });

  it("rejects an unregistered key with 400", async () => {
    const res = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ key: "not_a_real_setting", value: true });
    expect(res.status).toBe(400);
  });

  it("rejects a non-boolean value with 400", async () => {
    const res = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`)
      .send({ key: "vnc_enabled", value: "yes" });
    expect(res.status).toBe(400);
  });
});
