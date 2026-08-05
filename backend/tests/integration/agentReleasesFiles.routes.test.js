import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";

const app = createApp();

const RELEASES_DIR = path.join(process.cwd(), "uploads", "agent-releases");

describe("GET /agent-releases/files (integration, real DB + filesystem)", () => {
  const createdFiles = [];

  afterEach(() => {
    while (createdFiles.length) {
      fs.rmSync(path.join(RELEASES_DIR, createdFiles.pop()), { force: true });
    }
  });

  it("viewer and operator are blocked (403), admin-only like upload/is-active", async () => {
    for (const token of [viewerToken(), operatorToken()]) {
      const res = await request(app)
        .get("/api/protected/agent-releases/files")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it("admin sees a file that's actually on disk, with its size", async () => {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
    const name = `VITEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.zip`;
    const contents = Buffer.from("fake release zip contents for disk-listing test");
    fs.writeFileSync(path.join(RELEASES_DIR, name), contents);
    createdFiles.push(name);

    const res = await request(app)
      .get("/api/protected/agent-releases/files")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);

    const found = res.body.items.find((f) => f.name === name);
    expect(found).toBeTruthy();
    expect(found.size).toBe(contents.length);
  });
});
