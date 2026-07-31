import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken, operatorToken, viewerToken } from "../helpers/authToken.js";
import { testIp, deleteTestIpEntry } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

const app = createApp();

async function createTestIpEntry() {
  const res = await request(app)
    .post("/api/protected/ip-addresses")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ ip: testIp(), computerName: "DBCLEANUP-TEST-PC", site: "bolnica", entryType: "computer" });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("db cleanup routes (integration, real DB)", () => {
  let entryId;
  let ghostMetadataId;

  afterEach(async () => {
    if (ghostMetadataId) {
      await pool.execute("DELETE FROM computer_metadata WHERE id = ?", [ghostMetadataId]);
      ghostMetadataId = undefined;
    }
    await deleteTestIpEntry(entryId);
    entryId = undefined;
  });

  it("rejects non-admin roles with 403", async () => {
    for (const token of [operatorToken(), viewerToken()]) {
      const auditRes = await request(app)
        .get("/api/protected/server-health/ghost-audit")
        .set("Authorization", `Bearer ${token}`);
      expect(auditRes.status).toBe(403);

      const cleanupRes = await request(app)
        .post("/api/protected/server-health/ghost-cleanup")
        .set("Authorization", `Bearer ${token}`);
      expect(cleanupRes.status).toBe(403);
    }
  });

  it("audit reports zero orphans when the DB is clean", async () => {
    const res = await request(app)
      .get("/api/protected/server-health/ghost-audit")
      .set("Authorization", `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.totalOrphans).toBe(0);
  });

  it("finds and cleans up a metadata_id desync (row exists but pointer is NULL)", async () => {
    entryId = await createTestIpEntry();

    const [result] = await pool.execute(
      `INSERT INTO computer_metadata (ip_entry_id, computer_name) VALUES (?, ?)`,
      [entryId, "DBCLEANUP-TEST-PC"],
    );
    ghostMetadataId = result.insertId;
    // Simulate the desync: real metadata row exists, but the denormalized
    // pointer on ip_entries never got set.
    await pool.execute(`UPDATE ip_entries SET metadata_id = NULL WHERE id = ?`, [entryId]);

    const auditRes = await request(app)
      .get("/api/protected/server-health/ghost-audit")
      .set("Authorization", `Bearer ${adminToken()}`);
    const desync = auditRes.body.results.find((r) => r.table === "ip_entries" && r.column === "metadata_id");
    expect(desync.orphanCount).toBeGreaterThanOrEqual(1);

    const cleanupRes = await request(app)
      .post("/api/protected/server-health/ghost-cleanup")
      .set("Authorization", `Bearer ${adminToken()}`);
    expect(cleanupRes.status).toBe(200);
    const fix = cleanupRes.body.cleaned.find((c) => c.table === "ip_entries");
    expect(fix.fixed).toBeGreaterThanOrEqual(1);

    const [[row]] = await pool.query("SELECT metadata_id FROM ip_entries WHERE id = ?", [entryId]);
    expect(row.metadata_id).toBe(ghostMetadataId);
  });

  it("finds and deletes a true ghost row pointing at a deleted ip_entry", async () => {
    entryId = await createTestIpEntry();
    const [result] = await pool.execute(
      `INSERT INTO computer_metadata (ip_entry_id, computer_name) VALUES (?, ?)`,
      [entryId, "DBCLEANUP-TEST-PC"],
    );
    ghostMetadataId = result.insertId;

    // Delete the parent WITHOUT going through deleteTestIpEntry (which
    // would also clean up the metadata row) - this is exactly how the real
    // ghost row was produced (parent deleted, child left behind).
    await pool.execute("DELETE FROM ip_entries WHERE id = ?", [entryId]);
    entryId = undefined;

    const auditRes = await request(app)
      .get("/api/protected/server-health/ghost-audit")
      .set("Authorization", `Bearer ${adminToken()}`);
    const ghost = auditRes.body.results.find((r) => r.table === "computer_metadata");
    expect(ghost.orphanCount).toBeGreaterThanOrEqual(1);

    const cleanupRes = await request(app)
      .post("/api/protected/server-health/ghost-cleanup")
      .set("Authorization", `Bearer ${adminToken()}`);
    const deleted = cleanupRes.body.cleaned.find((c) => c.table === "computer_metadata");
    expect(deleted.deleted).toBeGreaterThanOrEqual(1);

    const [[row]] = await pool.query("SELECT id FROM computer_metadata WHERE id = ?", [ghostMetadataId]);
    expect(row).toBeUndefined();
    ghostMetadataId = undefined;
  });
});
