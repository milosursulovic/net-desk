import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ingestEventLogs, listEventLogsService } from "../../services/eventLogs.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

describe("eventLogs.service (integration, real DB)", () => {
  let ipEntryId;

  beforeEach(async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    ipEntryId = entry.id;
  });

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
  });

  it("ingests entries and they're listable afterwards", async () => {
    await ingestEventLogs(ipEntryId, [
      {
        logName: "System",
        level: "Error",
        source: "Microsoft-Windows-DistributedCOM",
        eventId: 10010,
        message: "test entry",
        loggedAt: new Date("2026-07-18T11:04:17.000Z"),
      },
    ]);

    const out = await listEventLogsService(ipEntryId, { page: 1, limit: 50 });
    expect(out.total).toBe(1);
    expect(out.items[0].source).toBe("Microsoft-Windows-DistributedCOM");
  });

  it(
    "re-ingesting the exact same batch is a no-op (INSERT IGNORE idempotency, " +
      "so a retry after a network failure doesn't duplicate entries)",
    async () => {
      const entries = [
        {
          logName: "System",
          level: "Warning",
          source: "TestSource",
          eventId: 42,
          message: "same event",
          loggedAt: new Date("2026-07-18T12:00:00.000Z"),
        },
      ];

      await ingestEventLogs(ipEntryId, entries);
      await ingestEventLogs(ipEntryId, entries);
      await ingestEventLogs(ipEntryId, entries);

      const out = await listEventLogsService(ipEntryId, { page: 1, limit: 50 });
      expect(out.total).toBe(1);
    },
  );

  it("does nothing for an empty entries array", async () => {
    await expect(ingestEventLogs(ipEntryId, [])).resolves.toBe(true);
    const out = await listEventLogsService(ipEntryId, { page: 1, limit: 50 });
    expect(out.total).toBe(0);
  });

  it("defaults logName to 'Application' when omitted", async () => {
    await ingestEventLogs(ipEntryId, [
      { level: "Information", eventId: 1, loggedAt: new Date() },
    ]);
    const out = await listEventLogsService(ipEntryId, {
      page: 1,
      limit: 50,
      logName: "Application",
    });
    expect(out.total).toBe(1);
  });

  it("listEventLogsService filters by logName and level", async () => {
    await ingestEventLogs(ipEntryId, [
      { logName: "System", level: "Error", eventId: 1, loggedAt: new Date("2026-01-01") },
      { logName: "System", level: "Warning", eventId: 2, loggedAt: new Date("2026-01-02") },
      { logName: "Application", level: "Error", eventId: 3, loggedAt: new Date("2026-01-03") },
    ]);

    const systemOnly = await listEventLogsService(ipEntryId, {
      page: 1,
      limit: 50,
      logName: "System",
    });
    expect(systemOnly.total).toBe(2);

    const systemErrorsOnly = await listEventLogsService(ipEntryId, {
      page: 1,
      limit: 50,
      logName: "System",
      level: "Error",
    });
    expect(systemErrorsOnly.total).toBe(1);
  });
});
