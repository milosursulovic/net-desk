import { describe, it, expect, afterEach } from "vitest";
import { createService as createIpEntryService } from "../../services/ipAddresses.service.js";
import { ingestProcessDetections, listProcessDetectionsService } from "../../services/processDetections.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

describe("processDetections.service (integration, real DB)", () => {
  let ipEntryId;

  afterEach(async () => {
    // computer_process_detections.ip_entry_id has ON DELETE CASCADE -
    // deleting the ip_entries row is enough cleanup.
    await deleteTestIpEntry(ipEntryId);
    ipEntryId = undefined;
  });

  it("ingestProcessDetections aggregates the same process synced twice into ONE row (count sums, lastSeen advances)", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const uniqueProcess = `vitest-proc-${Date.now()}`;

    await ingestProcessDetections(ipEntryId, [
      {
        processName: uniqueProcess,
        firstSeen: "2026-01-01T00:00:00.000Z",
        lastSeen: "2026-01-01T00:00:00.000Z",
        count: 1,
      },
    ]);

    await ingestProcessDetections(ipEntryId, [
      {
        processName: uniqueProcess,
        firstSeen: "2026-01-01T00:01:00.000Z",
        lastSeen: "2026-01-01T00:01:00.000Z",
        count: 1,
      },
    ]);

    const out = await listProcessDetectionsService({ search: uniqueProcess, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].detectionCount).toBe(2);
    expect(new Date(out.items[0].lastSeen).getTime()).toBe(new Date("2026-01-01T00:01:00.000Z").getTime());
    expect(new Date(out.items[0].firstSeen).getTime()).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  it("ingestProcessDetections normalizes process name casing/whitespace so re-sends still dedupe", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const baseProcess = `vitest-proc-case-${Date.now()}`;

    await ingestProcessDetections(ipEntryId, [
      { processName: `  ${baseProcess.toUpperCase()}  `, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);
    await ingestProcessDetections(ipEntryId, [
      { processName: baseProcess, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const out = await listProcessDetectionsService({ search: baseProcess, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].processName).toBe(baseProcess);
    expect(out.items[0].detectionCount).toBe(2);
  });

  it("listProcessDetectionsService filters by site (joined from ip_entries)", async () => {
    const uniqueProcess = `vitest-proc-site-${Date.now()}`;

    const a = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = a.id;
    await ingestProcessDetections(a.id, [
      { processName: uniqueProcess, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const matched = await listProcessDetectionsService({ search: uniqueProcess, site: "bolnica", page: 1, limit: 50 });
    expect(matched.items).toHaveLength(1);

    const notMatched = await listProcessDetectionsService({ search: uniqueProcess, site: "dom_zdravlja", page: 1, limit: 50 });
    expect(notMatched.items).toHaveLength(0);
  });

  it("ingestProcessDetections skips entries with an empty/missing process name", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    await expect(
      ingestProcessDetections(ipEntryId, [{ processName: "", firstSeen: new Date(), lastSeen: new Date(), count: 1 }]),
    ).resolves.toBe(true);

    const out = await listProcessDetectionsService({ search: "", page: 1, limit: 1000 });
    expect(out.items.every((i) => i.ipEntryId !== ipEntryId)).toBe(true);
  });

  // Regresioni test za bug upravo popravljen na DNS Logovima (search je
  // isprva pokrivao samo domain kolonu, pa je pretraga po hostname-u
  // vraćala 0 rezultata iako su podaci postojali) - ovde search mora od
  // početka da pogađa i po imenu računara, ne samo po imenu procesa.
  it("listProcessDetectionsService search also matches by computer name, not just process name", async () => {
    const uniqueHostname = `VITEST-PROC-PC-${Date.now()}`;
    const processName = "anydesk";

    const entry = await createIpEntryService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: uniqueHostname,
    });
    ipEntryId = entry.id;
    await ingestProcessDetections(ipEntryId, [
      { processName, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const out = await listProcessDetectionsService({ search: uniqueHostname, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].processName).toBe(processName);
  });

  it("ingestProcessDetections defaults killCount to 0 when the agent didn't attempt a kill", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const uniqueProcess = `vitest-proc-nokill-${Date.now()}`;

    await ingestProcessDetections(ipEntryId, [
      { processName: uniqueProcess, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const out = await listProcessDetectionsService({ search: uniqueProcess, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].killCount).toBe(0);
  });

  it("ingestProcessDetections aggregates killCount across cycles (killed=1 flag sums into a running total)", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const uniqueProcess = `vitest-proc-kill-${Date.now()}`;

    // Cycle 1: detected but NOT killed (e.g. KillWatchedProcesses off, or kill failed).
    await ingestProcessDetections(ipEntryId, [
      { processName: uniqueProcess, firstSeen: new Date(), lastSeen: new Date(), count: 1, killed: 0 },
    ]);
    // Cycle 2: detected AND killed.
    await ingestProcessDetections(ipEntryId, [
      { processName: uniqueProcess, firstSeen: new Date(), lastSeen: new Date(), count: 1, killed: 1 },
    ]);

    const out = await listProcessDetectionsService({ search: uniqueProcess, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].detectionCount).toBe(2);
    expect(out.items[0].killCount).toBe(1);
  });
});
