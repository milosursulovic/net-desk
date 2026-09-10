import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { pool } from "../../db/pool.js";

const app = createApp();

describe("GET /api/language (integration, real DB, no auth)", () => {
  afterEach(async () => {
    await pool.execute("DELETE FROM app_settings WHERE setting_key = 'app_language'");
  });

  it("returns the default language with no auth header and no stored override", async () => {
    const res = await request(app).get("/api/language");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: "sr" });
  });

  it("returns the stored override once app_language has been changed", async () => {
    await pool.execute(
      "INSERT INTO app_settings (setting_key, setting_value) VALUES ('app_language', 'en')",
    );
    const res = await request(app).get("/api/language");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: "en" });
  });
});
