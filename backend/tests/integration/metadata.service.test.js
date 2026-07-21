import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  upsertMetadataForIpEntry,
  patchMetadataForIpEntry,
} from "../../services/metadata.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

describe("metadata.service (integration, real DB)", () => {
  let ipEntryId;

  beforeEach(async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    ipEntryId = entry.id;
  });

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
  });

  it("upsertMetadataForIpEntry writes scalar fields and nested lists, readable back", async () => {
    const out = await upsertMetadataForIpEntry(ipEntryId, {
      OS: { Caption: "Microsoft Windows 10 Pro", Version: "10.0.19045" },
      System: { Manufacturer: "HP", Model: "Pavilion Aero" },
      RAMModules: [{ Slot: "A1", CapacityGB: 8 }, { Slot: "A2", CapacityGB: 8 }],
    });

    expect(out.OS.Caption).toBe("Microsoft Windows 10 Pro");
    expect(out.System.Manufacturer).toBe("HP");
    expect(out.RAMModules).toHaveLength(2);
  });

  it("a second upsert fully replaces nested lists (not append)", async () => {
    await upsertMetadataForIpEntry(ipEntryId, {
      RAMModules: [{ Slot: "A1", CapacityGB: 8 }, { Slot: "A2", CapacityGB: 8 }],
    });

    const second = await upsertMetadataForIpEntry(ipEntryId, {
      RAMModules: [{ Slot: "A1", CapacityGB: 16 }],
    });

    expect(second.RAMModules).toHaveLength(1);
    // DECIMAL columns come back from mysql2 as strings by default.
    expect(Number(second.RAMModules[0].CapacityGB)).toBe(16);
  });

  it("patchMetadataForIpEntry merges - a partial patch does not wipe unrelated existing fields", async () => {
    await upsertMetadataForIpEntry(ipEntryId, {
      OS: { Caption: "Microsoft Windows 10 Pro" },
      System: { Manufacturer: "HP" },
    });

    // Only sends CPU - OS/System must survive untouched, matching the
    // "merge, not overwrite" contract documented on patchMetadataForIpEntry
    // (a raw upsert would null out anything omitted from the payload).
    const patched = await patchMetadataForIpEntry(ipEntryId, {
      CPU: { Name: "AMD Ryzen 7 7735U" },
    });

    expect(patched.OS.Caption).toBe("Microsoft Windows 10 Pro");
    expect(patched.System.Manufacturer).toBe("HP");
    expect(patched.CPU.Name).toBe("AMD Ryzen 7 7735U");
  });

  it("patchMetadataForIpEntry deep-merges within a nested object (patching OS.Build keeps OS.Caption)", async () => {
    await patchMetadataForIpEntry(ipEntryId, {
      OS: { Caption: "Microsoft Windows 10 Pro", Version: "10.0.19045" },
    });

    const patched = await patchMetadataForIpEntry(ipEntryId, {
      OS: { Build: "19045" },
    });

    expect(patched.OS.Caption).toBe("Microsoft Windows 10 Pro");
    expect(patched.OS.Version).toBe("10.0.19045");
    expect(patched.OS.Build).toBe("19045");
  });

  it(
    "a second patch call correctly overwrites a previously-set scalar field " +
      "(regression: PascalCase-key-shadows-fresh-data merge bug)",
    async () => {
      await patchMetadataForIpEntry(ipEntryId, {
        OS: { Caption: "Microsoft Windows 10 Pro" },
      });

      const second = await patchMetadataForIpEntry(ipEntryId, {
        OS: { Caption: "Microsoft Windows 11 Pro" },
      });

      expect(second.OS.Caption).toBe("Microsoft Windows 11 Pro");
    },
  );

  it("patching RAMModules/GPUs/NICs preserves them when a later patch omits those keys entirely", async () => {
    await upsertMetadataForIpEntry(ipEntryId, {
      RAMModules: [{ Slot: "A1", CapacityGB: 8 }],
    });

    // Event-log-only-shaped patch: no RAMModules key at all.
    const patched = await patchMetadataForIpEntry(ipEntryId, {
      OS: { Caption: "Windows 10" },
    });

    expect(patched.RAMModules).toHaveLength(1);
  });
});
