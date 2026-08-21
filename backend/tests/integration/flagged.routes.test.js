import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, deleteTestAgent, testIp, testHostname } from "../helpers/testDb.js";
import {
  syncComputerSoftware,
  getComputerSoftware,
  syncComputerServices,
  getComputerServices,
  syncComputerDrivers,
  getComputerDrivers,
} from "../../services/pdsu.service.js";
import { enrollAgent } from "../../services/agents.service.js";
import { findAgentByUid, linkAgentToIpEntry } from "../../repositories/agents.repo.js";
import { pool } from "../../db/pool.js";

const app = createApp();

async function deleteFlaggedSoftwareByName(displayName) {
  await pool.execute("DELETE FROM flagged_software WHERE display_name = ?", [displayName]);
}
async function deleteFlaggedServiceByName(name) {
  await pool.execute("DELETE FROM flagged_services WHERE name = ?", [name]);
}
async function deleteFlaggedDriverByName(deviceName) {
  await pool.execute("DELETE FROM flagged_drivers WHERE device_name = ?", [deviceName]);
}

describe("flagged software/services routes (integration, real DB)", () => {
  afterEach(async () => {
    await deleteFlaggedSoftwareByName("VITEST_TEAMVIEWER");
    await deleteFlaggedServiceByName("VITEST_TVSERVICE");
    await deleteFlaggedDriverByName("VITEST_DRIVER");
  });

  it("viewer can list but is blocked (403) from creating a flagged entry", async () => {
    const listRes = await request(app)
      .get("/api/protected/flagged/software")
      .set("Authorization", `Bearer ${viewerToken()}`);
    expect(listRes.status).toBe(200);

    const createRes = await request(app)
      .post("/api/protected/flagged/software")
      .set("Authorization", `Bearer ${viewerToken()}`)
      .send({ displayName: "VITEST_TEAMVIEWER" });
    expect(createRes.status).toBe(403);
  });

  it("operator can create a flagged software entry (duplicates rejected), but only admin can delete it", async () => {
    const createRes = await request(app)
      .post("/api/protected/flagged/software")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ displayName: "VITEST_TEAMVIEWER", publisher: "TeamViewer GmbH" });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const dupRes = await request(app)
      .post("/api/protected/flagged/software")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ displayName: "VITEST_TEAMVIEWER", publisher: "TeamViewer GmbH" });
    expect(dupRes.status).toBe(400);

    const operatorDelRes = await request(app)
      .delete(`/api/protected/flagged/software/${id}`)
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(operatorDelRes.status).toBe(403);

    const delRes = await request(app)
      .delete(`/api/protected/flagged/software/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(delRes.status).toBe(200);
  });

  it(
    "flagging a program by substring marks matching installs on any computer as is_flagged, " +
      "and the computer list exposes a flaggedSoftwareCount",
    async () => {
      const entry = await createService({ ip: testIp(), entryType: "computer" });
      try {
        await syncComputerSoftware(entry.id, [
          { displayName: "VITEST_TEAMVIEWER 15", displayVersion: "15.0", publisher: "TeamViewer GmbH" },
          { displayName: "VITEST_Unrelated App", displayVersion: "1.0", publisher: "Someone" },
        ]);

        const flagRes = await request(app)
          .post("/api/protected/flagged/software")
          .set("Authorization", `Bearer ${operatorToken()}`)
          .send({ displayName: "VITEST_TEAMVIEWER" });
        expect(flagRes.status).toBe(201);

        const rows = await getComputerSoftware(entry.id);
        const flagged = rows.find((r) => r.display_name === "VITEST_TEAMVIEWER 15");
        const unrelated = rows.find((r) => r.display_name === "VITEST_Unrelated App");
        expect(Number(flagged.is_flagged)).toBe(1);
        expect(Number(unrelated.is_flagged)).toBe(0);

        const listRes = await request(app)
          .get(`/api/protected/ip-addresses?search=${entry.ip}`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(listRes.status).toBe(200);
        const item = listRes.body.entries.find((i) => i.id === entry.id);
        expect(Number(item.flaggedSoftwareCount)).toBe(1);
      } finally {
        await deleteTestIpEntry(entry.id);
      }
    },
  );

  it("flagging a service by substring marks matching services on any computer as is_flagged", async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    try {
      await syncComputerServices(entry.id, [
        { name: "VITEST_TVSERVICE_15", displayName: "TeamViewer 15", state: "Running" },
        { name: "VITEST_Spooler", displayName: "Print Spooler", state: "Running" },
      ]);

      const flagRes = await request(app)
        .post("/api/protected/flagged/services")
        .set("Authorization", `Bearer ${operatorToken()}`)
        .send({ name: "VITEST_TVSERVICE" });
      expect(flagRes.status).toBe(201);

      const rows = await getComputerServices(entry.id);
      const flagged = rows.find((r) => r.name === "VITEST_TVSERVICE_15");
      const unrelated = rows.find((r) => r.name === "VITEST_Spooler");
      expect(Number(flagged.is_flagged)).toBe(1);
      expect(Number(unrelated.is_flagged)).toBe(0);
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });

  it("operator can create a flagged driver entry (duplicates rejected), but only admin can delete it", async () => {
    const createRes = await request(app)
      .post("/api/protected/flagged/drivers")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ deviceName: "VITEST_DRIVER", driverProviderName: "Acme Corp" });
    expect(createRes.status).toBe(201);
    const id = createRes.body.id;

    const dupRes = await request(app)
      .post("/api/protected/flagged/drivers")
      .set("Authorization", `Bearer ${operatorToken()}`)
      .send({ deviceName: "VITEST_DRIVER", driverProviderName: "Acme Corp" });
    expect(dupRes.status).toBe(400);

    const operatorDelRes = await request(app)
      .delete(`/api/protected/flagged/drivers/${id}`)
      .set("Authorization", `Bearer ${operatorToken()}`);
    expect(operatorDelRes.status).toBe(403);

    const delRes = await request(app)
      .delete(`/api/protected/flagged/drivers/${id}`)
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(delRes.status).toBe(200);
  });

  it(
    "flagging a driver by substring marks matching entries on any computer as is_flagged, " +
      "and the computer list exposes a flaggedDriverCount",
    async () => {
      const entry = await createService({ ip: testIp(), entryType: "computer" });
      try {
        await syncComputerDrivers(entry.id, [
          { deviceName: "VITEST_DRIVER Adapter", driverProviderName: "Acme Corp" },
          { deviceName: "VITEST_Unrelated Device", driverProviderName: "Someone" },
        ]);

        const flagRes = await request(app)
          .post("/api/protected/flagged/drivers")
          .set("Authorization", `Bearer ${operatorToken()}`)
          .send({ deviceName: "VITEST_DRIVER" });
        expect(flagRes.status).toBe(201);

        const rows = await getComputerDrivers(entry.id);
        const flagged = rows.find((r) => r.device_name === "VITEST_DRIVER Adapter");
        const unrelated = rows.find((r) => r.device_name === "VITEST_Unrelated Device");
        expect(Number(flagged.is_flagged)).toBe(1);
        expect(Number(unrelated.is_flagged)).toBe(0);

        const listRes = await request(app)
          .get(`/api/protected/ip-addresses?search=${entry.ip}`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(listRes.status).toBe(200);
        const item = listRes.body.entries.find((i) => i.id === entry.id);
        expect(Number(item.flaggedDriverCount)).toBe(1);
      } finally {
        await deleteTestIpEntry(entry.id);
      }
    },
  );

  it(
    "GET /flagged/software/:id/agents returns only the active agent(s) matching the flagged pattern " +
      "on the requested site, and none on a different site",
    async () => {
      const entry = await createService({ ip: testIp(), entryType: "computer", site: "bolnica" });
      let agentId;
      try {
        const enrolled = await enrollAgent({ hostname: testHostname() });
        const byUid = await findAgentByUid(enrolled.agentId);
        agentId = byUid.id;
        await linkAgentToIpEntry(agentId, entry.id);

        await syncComputerSoftware(entry.id, [
          { displayName: "VITEST_TEAMVIEWER 15", displayVersion: "15.0", publisher: "TeamViewer GmbH" },
          { displayName: "VITEST_Unrelated App", displayVersion: "1.0", publisher: "Someone" },
        ]);

        const flagRes = await request(app)
          .post("/api/protected/flagged/software")
          .set("Authorization", `Bearer ${operatorToken()}`)
          .send({ displayName: "VITEST_TEAMVIEWER" });
        expect(flagRes.status).toBe(201);
        const flaggedId = flagRes.body.id;

        const sameSiteRes = await request(app)
          .get(`/api/protected/flagged/software/${flaggedId}/agents?site=bolnica`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(sameSiteRes.status).toBe(200);
        expect(sameSiteRes.body.agentIds).toContain(agentId);

        const otherSiteRes = await request(app)
          .get(`/api/protected/flagged/software/${flaggedId}/agents?site=dom_zdravlja`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(otherSiteRes.status).toBe(200);
        expect(otherSiteRes.body.agentIds).not.toContain(agentId);
      } finally {
        await deleteTestAgent(agentId);
        await deleteTestIpEntry(entry.id);
      }
    },
  );

  it(
    "an exception on one computer excludes just that computer's agent from GET /flagged/software/:id/agents, " +
      "and POST/DELETE /pdsu/:id/flagged-exceptions/:kind/:flaggedId wire the exception end to end",
    async () => {
      const entry = await createService({ ip: testIp(), entryType: "computer", site: "bolnica" });
      let agentId;
      try {
        const enrolled = await enrollAgent({ hostname: testHostname() });
        const byUid = await findAgentByUid(enrolled.agentId);
        agentId = byUid.id;
        await linkAgentToIpEntry(agentId, entry.id);

        await syncComputerSoftware(entry.id, [
          { displayName: "VITEST_TEAMVIEWER 15", displayVersion: "15.0", publisher: "TeamViewer GmbH" },
        ]);

        const flagRes = await request(app)
          .post("/api/protected/flagged/software")
          .set("Authorization", `Bearer ${operatorToken()}`)
          .send({ displayName: "VITEST_TEAMVIEWER" });
        expect(flagRes.status).toBe(201);
        const flaggedId = flagRes.body.id;

        const beforeRes = await request(app)
          .get(`/api/protected/flagged/software/${flaggedId}/agents`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(beforeRes.body.agentIds).toContain(agentId);

        const addExceptionRes = await request(app)
          .post(`/api/protected/pdsu/${entry.id}/flagged-exceptions/software/${flaggedId}`)
          .set("Authorization", `Bearer ${operatorToken()}`);
        expect(addExceptionRes.status).toBe(200);

        const afterRes = await request(app)
          .get(`/api/protected/flagged/software/${flaggedId}/agents`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(afterRes.body.agentIds).not.toContain(agentId);

        const listExceptionsRes = await request(app)
          .get(`/api/protected/pdsu/${entry.id}/flagged-exceptions`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(listExceptionsRes.status).toBe(200);
        expect(listExceptionsRes.body.software.map((s) => s.id)).toContain(flaggedId);

        const removeExceptionRes = await request(app)
          .delete(`/api/protected/pdsu/${entry.id}/flagged-exceptions/software/${flaggedId}`)
          .set("Authorization", `Bearer ${operatorToken()}`);
        expect(removeExceptionRes.status).toBe(200);

        const restoredRes = await request(app)
          .get(`/api/protected/flagged/software/${flaggedId}/agents`)
          .set("Authorization", `Bearer ${viewerToken()}`);
        expect(restoredRes.body.agentIds).toContain(agentId);
      } finally {
        await deleteTestAgent(agentId);
        await deleteTestIpEntry(entry.id);
      }
    },
  );

  it("POST/DELETE /pdsu/:id/flagged-exceptions/:kind rejects an unknown kind with 400", async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    try {
      const postRes = await request(app)
        .post(`/api/protected/pdsu/${entry.id}/flagged-exceptions/bogus/1`)
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(postRes.status).toBe(400);

      const delRes = await request(app)
        .delete(`/api/protected/pdsu/${entry.id}/flagged-exceptions/bogus/1`)
        .set("Authorization", `Bearer ${operatorToken()}`);
      expect(delRes.status).toBe(400);
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });
});
