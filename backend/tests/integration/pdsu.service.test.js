import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  syncComputerSoftware,
  getComputerSoftware,
  syncComputerDrivers,
  getComputerDrivers,
  syncComputerUpdates,
  getComputerUpdates,
  syncComputerServices,
  getComputerServices,
  addFlaggedExceptionService,
  removeFlaggedExceptionService,
  listFlaggedExceptionsService,
} from "../../services/pdsu.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";
import {
  insertFlaggedSoftware,
  deleteFlaggedSoftware,
  insertFlaggedService,
  deleteFlaggedService,
} from "../../repositories/flagged.repo.js";

describe("pdsu.service (integration, real DB)", () => {
  let ipEntryId;

  beforeEach(async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    ipEntryId = entry.id;
  });

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
  });

  it(
    "syncComputerSoftware stores null for an unparseable installDate instead of crashing " +
      "(regression: real registry InstallDate garbage like '1784235052' 500'd the insert live)",
    async () => {
      await syncComputerSoftware(ipEntryId, [
        // The client (SoftwareCollector.cs) already converts registry
        // yyyyMMdd to an ISO "yyyy-MM-dd" string before sending - this
        // backend-level test uses that same already-normalized shape.
        { displayName: "Git", displayVersion: "2.55.0", publisher: "Git", installDate: "2023-01-01" },
        { displayName: "BadEntry", displayVersion: "1.0", publisher: "X", installDate: "1784235052" },
      ]);

      const rows = await getComputerSoftware(ipEntryId);
      expect(rows).toHaveLength(2);

      const good = rows.find((r) => r.display_name === "Git");
      const bad = rows.find((r) => r.display_name === "BadEntry");
      expect(good.install_date).not.toBeNull();
      expect(bad.install_date).toBeNull();
    },
  );

  it("syncComputerDrivers stores null for an unparseable driverDate", async () => {
    await syncComputerDrivers(ipEntryId, [
      { deviceName: "WAN Miniport", driverVersion: "10.0", driverDate: "garbage" },
    ]);
    const rows = await getComputerDrivers(ipEntryId);
    expect(rows).toHaveLength(1);
    expect(rows[0].driver_date).toBeNull();
  });

  it("syncComputerUpdates stores null for an unparseable installedOn", async () => {
    await syncComputerUpdates(ipEntryId, [
      { description: "Security Update", hotFixID: "KB123", installedOn: "not-a-date" },
    ]);
    const rows = await getComputerUpdates(ipEntryId);
    expect(rows).toHaveLength(1);
    expect(rows[0].installed_on).toBeNull();
  });

  it("a sync fully replaces the previous set (delete+reinsert, not append)", async () => {
    await syncComputerServices(ipEntryId, [
      { name: "Spooler", displayName: "Print Spooler", state: "Running" },
      { name: "AJRouter", displayName: "AllJoyn Router", state: "Stopped" },
    ]);
    expect(await getComputerServices(ipEntryId)).toHaveLength(2);

    await syncComputerServices(ipEntryId, [
      { name: "Spooler", displayName: "Print Spooler", state: "Stopped" },
    ]);
    const rows = await getComputerServices(ipEntryId);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("Stopped");
  });

  it("syncing an empty array clears all rows for that computer", async () => {
    await syncComputerServices(ipEntryId, [
      { name: "Spooler", displayName: "Print Spooler", state: "Running" },
    ]);
    expect(await getComputerServices(ipEntryId)).toHaveLength(1);

    await syncComputerServices(ipEntryId, []);
    expect(await getComputerServices(ipEntryId)).toHaveLength(0);
  });

  it("rejects syncing for a computer that doesn't exist", async () => {
    await expect(
      syncComputerSoftware(999999999, [{ displayName: "X" }]),
    ).rejects.toMatchObject({ status: 404 });
  });

  describe("flagged item exceptions (per-computer)", () => {
    let flaggedSoftwareId;

    afterEach(async () => {
      if (flaggedSoftwareId) await deleteFlaggedSoftware(flaggedSoftwareId);
      flaggedSoftwareId = undefined;
    });

    it("getComputerSoftware reports is_flagged/matchedFlaggedId, and an exception clears both without touching the global flag", async () => {
      const uniqueName = `VITEST_FLAGGED_${Date.now()}`;
      flaggedSoftwareId = await insertFlaggedSoftware({ displayName: uniqueName, publisher: null, reason: null });

      await syncComputerSoftware(ipEntryId, [{ displayName: uniqueName, displayVersion: "1.0" }]);

      const before = await getComputerSoftware(ipEntryId);
      const rowBefore = before.find((r) => r.display_name === uniqueName);
      expect(rowBefore.is_flagged).toBe(true);
      expect(rowBefore.matchedFlaggedId).toBe(flaggedSoftwareId);

      await addFlaggedExceptionService(ipEntryId, "software", flaggedSoftwareId, null);

      const after = await getComputerSoftware(ipEntryId);
      const rowAfter = after.find((r) => r.display_name === uniqueName);
      expect(rowAfter.is_flagged).toBe(false);
      expect(rowAfter.matchedFlaggedId).toBeNull();

      // Exception is per-computer - a second, unrelated computer with the
      // same software is still flagged, the global flagged_software row is
      // untouched.
      const otherEntry = await createService({ ip: testIp(), entryType: "computer" });
      try {
        await syncComputerSoftware(otherEntry.id, [{ displayName: uniqueName, displayVersion: "1.0" }]);
        const otherRows = await getComputerSoftware(otherEntry.id);
        expect(otherRows.find((r) => r.display_name === uniqueName).is_flagged).toBe(true);
      } finally {
        await deleteTestIpEntry(otherEntry.id);
      }
    });

    it("listFlaggedExceptionsService lists an active exception, removeFlaggedExceptionService un-excepts it", async () => {
      const uniqueName = `VITEST_FLAGGED_${Date.now()}`;
      flaggedSoftwareId = await insertFlaggedSoftware({ displayName: uniqueName, publisher: null, reason: null });
      await syncComputerSoftware(ipEntryId, [{ displayName: uniqueName }]);

      await addFlaggedExceptionService(ipEntryId, "software", flaggedSoftwareId, null);
      const listed = await listFlaggedExceptionsService(ipEntryId);
      expect(listed.software.map((s) => s.id)).toContain(flaggedSoftwareId);

      await removeFlaggedExceptionService(ipEntryId, "software", flaggedSoftwareId);
      const rows = await getComputerSoftware(ipEntryId);
      expect(rows.find((r) => r.display_name === uniqueName).is_flagged).toBe(true);

      const listedAfter = await listFlaggedExceptionsService(ipEntryId);
      expect(listedAfter.software.map((s) => s.id)).not.toContain(flaggedSoftwareId);
    });

    it("removeFlaggedExceptionService throws 404 when there's no exception to remove", async () => {
      flaggedSoftwareId = await insertFlaggedSoftware({
        displayName: `VITEST_FLAGGED_${Date.now()}`,
        publisher: null,
        reason: null,
      });
      await expect(
        removeFlaggedExceptionService(ipEntryId, "software", flaggedSoftwareId),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("rejects an unknown kind with 400", async () => {
      await expect(
        addFlaggedExceptionService(ipEntryId, "bogus", 1, null),
      ).rejects.toMatchObject({ status: 400 });
    });

    it(
      "a software item matching TWO flagged rules only clears once BOTH are excepted " +
        "(exceptions are per-rule, not per-item)",
      async () => {
        const uniqueBase = `VITEST_FLAGGED_${Date.now()}`;
        const ruleA = await insertFlaggedSoftware({ displayName: uniqueBase, publisher: null, reason: null });
        const ruleB = await insertFlaggedSoftware({
          displayName: `${uniqueBase}_SUFFIX`,
          publisher: null,
          reason: null,
        });
        flaggedSoftwareId = ruleA;

        try {
          // "VITEST_FLAGGED_x_SUFFIX" contains both "VITEST_FLAGGED_x" (ruleA)
          // and "VITEST_FLAGGED_x_SUFFIX" (ruleB) as substrings.
          await syncComputerSoftware(ipEntryId, [{ displayName: `${uniqueBase}_SUFFIX` }]);

          await addFlaggedExceptionService(ipEntryId, "software", ruleA, null);
          const stillFlagged = await getComputerSoftware(ipEntryId);
          expect(stillFlagged.find((r) => r.display_name === `${uniqueBase}_SUFFIX`).is_flagged).toBe(true);

          await addFlaggedExceptionService(ipEntryId, "software", ruleB, null);
          const cleared = await getComputerSoftware(ipEntryId);
          expect(cleared.find((r) => r.display_name === `${uniqueBase}_SUFFIX`).is_flagged).toBe(false);
        } finally {
          await deleteFlaggedSoftware(ruleB);
        }
      },
    );

    it("exceptions apply per entity type (software) independently of another type (services)", async () => {
      const uniqueName = `VITEST_FLAGGED_SVC_${Date.now()}`;
      const flaggedServiceId = await insertFlaggedService({ name: uniqueName, displayName: null, reason: null });
      try {
        await syncComputerServices(ipEntryId, [{ name: uniqueName, displayName: uniqueName, state: "Running" }]);

        const before = await getComputerServices(ipEntryId);
        expect(before.find((r) => r.name === uniqueName).is_flagged).toBe(true);

        await addFlaggedExceptionService(ipEntryId, "services", flaggedServiceId, null);
        const after = await getComputerServices(ipEntryId);
        expect(after.find((r) => r.name === uniqueName).is_flagged).toBe(false);
      } finally {
        await deleteFlaggedService(flaggedServiceId);
      }
    });
  });
});
