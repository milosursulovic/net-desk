import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";
import { syncComputerSoftware, getComputerSoftware, syncComputerServices, getComputerServices } from "../../services/pdsu.service.js";
import { pool } from "../../db/pool.js";

const app = createApp();

async function deleteFlaggedSoftwareByName(displayName) {
  await pool.execute("DELETE FROM flagged_software WHERE display_name = ?", [displayName]);
}
async function deleteFlaggedServiceByName(name) {
  await pool.execute("DELETE FROM flagged_services WHERE name = ?", [name]);
}

describe("flagged software/services routes (integration, real DB)", () => {
  afterEach(async () => {
    await deleteFlaggedSoftwareByName("VITEST_TEAMVIEWER");
    await deleteFlaggedServiceByName("VITEST_TVSERVICE");
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

  it("operator can create and delete a flagged software entry, duplicates are rejected", async () => {
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
});
