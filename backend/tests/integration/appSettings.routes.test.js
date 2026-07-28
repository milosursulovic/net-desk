import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";

const app = createApp();

// APP_SETTINGS (backend/dtos/appSettings.dto.js) is currently empty - the
// registry framework stays for future flags, but there's nothing real to
// toggle right now. These tests cover the generic framework's behavior
// (RBAC, empty listing, rejecting any key since none are registered yet).
describe("app settings routes (integration, real DB)", () => {
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

  it("admin gets an empty list when the registry has no settings", async () => {
    const res = await request(app)
      .get("/api/protected/settings")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("rejects any key with 400 when the registry is empty", async () => {
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
      .send({ key: "not_a_real_setting", value: "yes" });
    expect(res.status).toBe(400);
  });
});
