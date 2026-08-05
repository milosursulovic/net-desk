import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";

const app = createApp();

const DOWNLOADS_DIR = path.join(process.cwd(), "uploads", "downloads");

function testFileName(suffix = "") {
  return `VITEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`;
}

function deleteTestFile(name) {
  if (!name) return;
  fs.rmSync(path.join(DOWNLOADS_DIR, name), { force: true });
}

describe("downloads-folder routes (integration, real DB + filesystem)", () => {
  const createdFiles = [];

  afterEach(() => {
    while (createdFiles.length) {
      deleteTestFile(createdFiles.pop());
    }
  });

  it("viewer and operator are blocked (403) from every route - admin-only across the board", async () => {
    for (const token of [viewerToken(), operatorToken()]) {
      const listRes = await request(app)
        .get("/api/protected/downloads-folder")
        .set("Authorization", `Bearer ${token}`);
      expect(listRes.status).toBe(403);

      const deleteRes = await request(app)
        .delete("/api/protected/downloads-folder/whatever.txt")
        .set("Authorization", `Bearer ${token}`);
      expect(deleteRes.status).toBe(403);
    }
  });

  it("admin can upload a file, sees it in the list, then deletes it", async () => {
    const name = testFileName(".txt");
    createdFiles.push(name);

    const uploadRes = await request(app)
      .post("/api/protected/downloads-folder")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("file", Buffer.from("hello from vitest"), name);
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe(name);
    expect(fs.existsSync(path.join(DOWNLOADS_DIR, name))).toBe(true);

    const listRes = await request(app)
      .get("/api/protected/downloads-folder")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((f) => f.name === name)).toBe(true);

    const deleteRes = await request(app)
      .delete(`/api/protected/downloads-folder/${encodeURIComponent(name)}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(deleteRes.status).toBe(200);
    expect(fs.existsSync(path.join(DOWNLOADS_DIR, name))).toBe(false);

    createdFiles.pop();
  });

  it("deleting an unknown file returns 404", async () => {
    const res = await request(app)
      .delete(`/api/protected/downloads-folder/${testFileName(".missing")}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });

  it("a path-traversal filename on delete is neutralized to a basename (404, not touching anything outside the folder)", async () => {
    // path.basename() strips the "../../" segments down to just
    // "server.js" before any existence check - the request 404s (no such
    // file INSIDE the downloads folder) rather than reaching outside it.
    // The real assertion here is the second one: the actual project file
    // must survive untouched.
    const res = await request(app)
      .delete(`/api/protected/downloads-folder/${encodeURIComponent("../../server.js")}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
    expect(fs.existsSync(path.join(process.cwd(), "server.js"))).toBe(true);
  });

  it("sanitizes a path-traversal originalname on upload down to its basename, staying inside the downloads folder", async () => {
    const uploadRes = await request(app)
      .post("/api/protected/downloads-folder")
      .set("Authorization", `Bearer ${adminToken()}`)
      .attach("file", Buffer.from("traversal attempt"), "../../evil.txt");
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.name).toBe("evil.txt");
    createdFiles.push("evil.txt");

    expect(fs.existsSync(path.join(DOWNLOADS_DIR, "evil.txt"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "evil.txt"))).toBe(false);
  });
});
