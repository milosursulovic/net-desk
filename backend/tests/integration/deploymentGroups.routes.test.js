import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { pool } from "../../db/pool.js";

const app = createApp();

describe("deployment-groups routes (integration, real DB)", () => {
  afterEach(async () => {
    await pool.execute("DELETE FROM deployment_groups_list WHERE name LIKE 'VITEST_DGROUP_%'");
  });

  it("any authenticated role can list deployment groups", async () => {
    for (const token of [viewerToken(), operatorToken(), adminToken()]) {
      const res = await request(app)
        .get("/api/protected/deployment-groups")
        .set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
  });

  it("viewer cannot create a deployment group, operator can", async () => {
    const name = `VITEST_DGROUP_${Date.now()}`;

    const viewerRes = await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ name });
    expect(viewerRes.status).toBe(403);

    const operatorRes = await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });
    expect(operatorRes.status).toBe(201);

    const listRes = await request(app)
      .get("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(listRes.body).toContain(name);
  });

  it("rejects a duplicate deployment group name with 409", async () => {
    const name = `VITEST_DGROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const res = await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });
    expect(res.status).toBe(409);
  });

  it("usage endpoint reports zero usage for a freshly-created deployment group", async () => {
    const name = `VITEST_DGROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const res = await request(app)
      .get("/api/protected/deployment-groups/usage")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(res.status).toBe(200);
    const entry = res.body.find((g) => g.name === name);
    expect(entry).toMatchObject({ agentCount: 0, releaseCount: 0 });
  });

  it("operator cannot delete a deployment group, admin can (when unused)", async () => {
    const name = `VITEST_DGROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const operatorRes = await request(app)
      .delete(`/api/protected/deployment-groups/${name}`)
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(operatorRes.status).toBe(403);

    const adminRes = await request(app)
      .delete(`/api/protected/deployment-groups/${name}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(adminRes.status).toBe(204);

    const listRes = await request(app)
      .get("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(listRes.body).not.toContain(name);
  });

  it("refuses to delete a deployment group that is still assigned to an agent", async () => {
    const name = `VITEST_DGROUP_${Date.now()}`;
    await request(app)
      .post("/api/protected/deployment-groups")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ name });

    const { enrollAgent, addAgentDeploymentGroupService } = await import("../../services/agents.service.js");
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const { deleteTestAgent, testHostname } = await import("../helpers/testDb.js");

    const enrolled = await enrollAgent({ hostname: testHostname() });
    const agent = await findAgentByUid(enrolled.agentId);
    await addAgentDeploymentGroupService(agent.id, name);

    try {
      const res = await request(app)
        .delete(`/api/protected/deployment-groups/${name}`)
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(409);
    } finally {
      await deleteTestAgent(agent.id);
    }
  });

  it("deleting an unknown deployment group returns 404", async () => {
    const res = await request(app)
      .delete("/api/protected/deployment-groups/VITEST_DGROUP_DOES_NOT_EXIST")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
