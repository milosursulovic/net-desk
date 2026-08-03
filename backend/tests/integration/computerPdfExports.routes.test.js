import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { adminToken } from "../helpers/authToken.js";
import { testIp, deleteTestIpEntry } from "../helpers/testDb.js";

const app = createApp();

async function createTestIpEntry(computerName) {
  const res = await request(app)
    .post("/api/protected/ip-addresses")
    .set("Authorization", `Bearer ${adminToken()}`)
    .send({ ip: testIp(), computerName, site: "bolnica", entryType: "computer" });
  expect(res.status).toBe(201);
  return res.body;
}

describe("single-computer PDF exports (integration, real DB)", () => {
  let entryId;

  afterEach(async () => {
    await deleteTestIpEntry(entryId);
    entryId = undefined;
  });

  describe("metadata export", () => {
    it("returns 404 when the computer has no metadata", async () => {
      const entry = await createTestIpEntry("PDFEXPORT-NOMETA-PC");
      entryId = entry.id;

      const res = await request(app)
        .get(`/api/protected/metadata/${entryId}/export-pdf`)
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });

    it("streams a PDF for a computer that has metadata", async () => {
      const entry = await createTestIpEntry("PDFEXPORT-META-PC");
      entryId = entry.id;

      const upsertRes = await request(app)
        .post(`/api/protected/ip-addresses/${entry.ip}/metadata`)
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ ComputerName: "PDFEXPORT-META-PC", OS: { Caption: "Windows 11 Pro" } });
      expect(upsertRes.status).toBe(200);

      const res = await request(app)
        .get(`/api/protected/metadata/${entryId}/export-pdf`)
        .set("Authorization", `Bearer ${adminToken()}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
    });
  });

  describe("PDSU export", () => {
    it("streams a PDF even with no PDSU data (empty sections)", async () => {
      const entry = await createTestIpEntry("PDFEXPORT-PDSU-PC");
      entryId = entry.id;

      const res = await request(app)
        .get(`/api/protected/pdsu/${entryId}/export-pdf`)
        .set("Authorization", `Bearer ${adminToken()}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
    });

    it("returns 404 for a nonexistent computer", async () => {
      const res = await request(app)
        .get("/api/protected/pdsu/999999999/export-pdf")
        .set("Authorization", `Bearer ${adminToken()}`);
      expect(res.status).toBe(404);
    });

    it("includes synced software in the PDF (rough content check via byte size)", async () => {
      const entry = await createTestIpEntry("PDFEXPORT-PDSU-SW-PC");
      entryId = entry.id;

      const syncRes = await request(app)
        .post(`/api/protected/pdsu/${entryId}/software/sync`)
        .set("Authorization", `Bearer ${adminToken()}`)
        .send({ software: [{ displayName: "Google Chrome", displayVersion: "128.0", publisher: "Google" }] });
      expect(syncRes.status).toBe(200);

      const emptyEntry = await createTestIpEntry("PDFEXPORT-PDSU-EMPTY-PC");
      const [withSw, empty] = await Promise.all([
        request(app)
          .get(`/api/protected/pdsu/${entryId}/export-pdf`)
          .set("Authorization", `Bearer ${adminToken()}`)
          .buffer(true)
          .parse((res, cb) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => cb(null, Buffer.concat(chunks)));
          }),
        request(app)
          .get(`/api/protected/pdsu/${emptyEntry.id}/export-pdf`)
          .set("Authorization", `Bearer ${adminToken()}`)
          .buffer(true)
          .parse((res, cb) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => cb(null, Buffer.concat(chunks)));
          }),
      ]);
      await deleteTestIpEntry(emptyEntry.id);

      expect(withSw.status).toBe(200);
      // A PDF with an actual software row should be larger than one whose
      // software table is just the "Nema podataka" empty state.
      expect(withSw.body.length).toBeGreaterThan(empty.body.length);
    });
  });

  describe("active printers export", () => {
    it("streams a PDF even with no printer data (empty state)", async () => {
      const res = await request(app)
        .get("/api/protected/pdsu-analytics/printers/active/export-pdf?site=bolnica")
        .set("Authorization", `Bearer ${adminToken()}`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.slice(0, 5).toString()).toBe("%PDF-");
    });
  });
});
