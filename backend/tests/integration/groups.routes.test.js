import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { pool } from "../../db/pool.js";

const app = createApp();

describe("groups routes (integration, real DB)", () => {
  afterEach(async () => {
    await pool.execute("DELETE FROM groups_list WHERE name LIKE 'VITEST_GROUP_%'");
  });

  it("any authenticated role can list groups", async () => {
    for (const token of [viewerToken(), operatorToken(), adminToken()]) {
      const res = await request(app)
        .get("/api/protected/groups")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it("viewer cannot create a group, operator can", async () => {
    const name = `VITEST_GROUP_${Date.now()}`;

    const viewerRes = await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ name });
    expect(viewerRes.status).toBe(403);

    const operatorRes = await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });
    expect(operatorRes.status).toBe(201);

    const listRes = await request(app)
      .get("/api/protected/groups")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(listRes.body).toContain(name);
  });

  it("rejects a duplicate group name with 409", async () => {
    const name = `VITEST_GROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const res = await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });
    expect(res.status).toBe(409);
  });

  it("rejects an empty name with 400", async () => {
    const res = await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name: "  " });
    expect(res.status).toBe(400);
  });

  it("usage endpoint reports zero usage for a freshly-created group", async () => {
    const name = `VITEST_GROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const res = await request(app)
      .get("/api/protected/groups/usage")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(200);
    const entry = res.body.find((g) => g.name === name);
    expect(entry).toMatchObject({ departmentCount: 0, deploymentCount: 0 });
  });

  it("operator cannot delete a group, admin can (when unused)", async () => {
    const name = `VITEST_GROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const operatorRes = await request(app)
      .delete(`/api/protected/groups/${name}`)
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(operatorRes.status).toBe(403);

    const adminRes = await request(app)
      .delete(`/api/protected/groups/${name}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(adminRes.status).toBe(204);

    const listRes = await request(app)
      .get("/api/protected/groups")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(listRes.body).not.toContain(name);
  });

  it("refuses to delete a group that is still in use", async () => {
    const name = `VITEST_GROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const { createService } = await import("../../services/ipAddresses.service.js");
    const { deleteTestIpEntry, testIp } = await import("../helpers/testDb.js");
    const entry = await createService({ ip: testIp(), site: "bolnica", department: name, entryType: "computer" });

    try {
      const res = await request(app)
        .delete(`/api/protected/groups/${name}`)
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(409);
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });

  it("deleting an unknown group returns 404", async () => {
    const res = await request(app)
      .delete("/api/protected/groups/VITEST_GROUP_DOES_NOT_EXIST")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
