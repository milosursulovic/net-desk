import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { pool } from "../../db/pool.js";

const app = createApp();

async function resetVncEnabled() {
  await pool.execute("DELETE FROM app_settings WHERE setting_key = 'vnc_enabled'");
}

describe("app settings routes (integration, real DB)", () => {
  afterEach(async () => {
    await resetVncEnabled();
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
        .send({ key: "vnc_enabled", value: true });
      expect(patchRes.status).toBe(403);
    }
  });

  it("lists known settings with their registry defaults when nothing is stored yet", async () => {
    const res = await request(app)
      .get("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const vnc = res.body.find((s) => s.key === "vnc_enabled");
    expect(vnc).toBeTruthy();
    expect(vnc.value).toBe(false);
    expect(vnc.updatedAt).toBeNull();
  });

  it("admin can toggle a setting on and off, and the value persists", async () => {
    const token = adminToken();

    const onRes = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "vnc_enabled", value: true });
    expect(onRes.status).toBe(200);
    expect(onRes.body.find((s) => s.key === "vnc_enabled").value).toBe(true);

    const listRes = await request(app)
      .get("/api/protected/settings")
      .set("Authorization", `Bearer ${token}`);
    const vnc = listRes.body.find((s) => s.key === "vnc_enabled");
    expect(vnc.value).toBe(true);
    expect(vnc.updatedAt).not.toBeNull();

    const offRes = await request(app)
      .patch("/api/protected/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ key: "vnc_enabled", value: false });
    expect(offRes.body.find((s) => s.key === "vnc_enabled").value).toBe(false);
  });

  it("rejects an unknown setting key with 400", async () => {
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
