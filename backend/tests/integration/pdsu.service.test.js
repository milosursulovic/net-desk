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
} from "../../services/pdsu.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

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
});
