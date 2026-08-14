import { describe, it, expect, afterEach } from "vitest";
import crypto from "crypto";
import {
  createService,
  updateService,
  deleteService,
  getByIdService,
  listService,
  filterOptionsService,
  duplicatesService,
  setPendingRepackService,
  exportXlsxRowsService,
  freeIpAddressesService,
  repackRecommendationsService,
} from "../../services/ipAddresses.service.js";
import { insertAgent, revokeAgentById, linkAgentToIpEntry } from "../../repositories/agents.repo.js";
import { upsertMetadataForIpEntry } from "../../services/metadata.service.js";
import { deleteTestIpEntry, deleteTestAgent, testIp, testHostname } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

describe("ipAddresses.service (integration, real DB)", () => {
  let ipEntryId;
  let ipEntryId2;

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
    await deleteTestIpEntry(ipEntryId2);
    ipEntryId = undefined;
    ipEntryId2 = undefined;
  });

  it("createService inserts and returns the full row", async () => {
    const ip = testIp();
    const entry = await createService({
      ip,
      computerName: "TEST-PC",
      department: "VITEST_DEPT",
      os: "Windows 11",
      entryType: "computer",
    });
    ipEntryId = entry.id;

    expect(entry.ip).toBe(ip);
    expect(entry.computerName).toBe("TEST-PC");
    expect(entry.entryType).toBe("computer");
  });

  it("exportXlsxRowsService includes osArchitecture and hasIzvolteFolder", async () => {
    const ip = testIp();
    const entry = await createService({
      ip,
      computerName: "TEST-PC",
      entryType: "computer",
    });
    ipEntryId = entry.id;

    // osArchitecture/hasIzvolteFolder su agent-derived polja (postavljena
    // preko inventory sync-a, vidi agents.service.js resolveIpEntryId) - ne
    // postoje u UpsertIpSchema, pa se za ovaj test postavljaju direktno.
    await pool.execute(
      "UPDATE ip_entries SET os_architecture = ?, has_izvolte_folder = 1 WHERE id = ?",
      ["64-bit", ipEntryId],
    );

    const rows = await exportXlsxRowsService(ip, undefined);
    const row = rows.find((r) => r.ip === ip);
    expect(row.osArchitecture).toBe("64-bit");
    expect(row.hasIzvolteFolder).toBe("Da");
  });

  it("updateService only touches fields explicitly present in the patch", async () => {
    const entry = await createService({
      ip: testIp(),
      computerName: "ORIGINAL-NAME",
      department: "VITEST_DEPT",
    });
    ipEntryId = entry.id;

    await updateService(ipEntryId, { department: "VITEST_DEPT_2" });

    const reloaded = await getByIdService(ipEntryId);
    expect(reloaded.computerName).toBe("ORIGINAL-NAME");
    expect(reloaded.department).toBe("VITEST_DEPT_2");
  });

  it("deleteService removes the row; getByIdService then 404s", async () => {
    const entry = await createService({ ip: testIp() });
    const id = entry.id;

    await deleteService(id);
    await expect(getByIdService(id)).rejects.toMatchObject({ status: 404 });
  });

  it("deleteService on a missing id throws 404", async () => {
    await expect(deleteService(999999999)).rejects.toMatchObject({ status: 404 });
  });

  it("listService filters by department (exact match, distinct from free-text search)", async () => {
    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const a = await createService({
      ip: testIp(),
      department: uniqueDept,
      entryType: "computer",
    });
    ipEntryId = a.id;
    const b = await createService({
      ip: testIp(),
      department: "some-other-department",
      entryType: "computer",
    });
    ipEntryId2 = b.id;

    const out = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      department: uniqueDept,
    });

    const ids = out.entries.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  it(
    "listService free-text search matches a multi-word department by any of its words, " +
      "not just its first word (regression: \"server sala\" used to match nothing)",
    async () => {
      const entry = await createService({
        ip: testIp(),
        department: "Server sala",
      });
      ipEntryId = entry.id;

      const out = await listService({
        page: 1,
        limit: 50,
        sortBy: "ip",
        sortOrder: "asc",
        status: "all",
        entryType: "all",
        search: "server sala",
      });
      expect(out.entries.some((e) => e.id === ipEntryId)).toBe(true);
    },
  );

  it("setPendingRepackService toggles the flag, is reflected in getByIdService, and filters listService", async () => {
    const entry = await createService({ ip: testIp(), entryType: "computer" });
    ipEntryId = entry.id;

    expect(Boolean((await getByIdService(entry.id)).pendingRepack)).toBe(false);

    const marked = await setPendingRepackService(entry.id, true);
    expect(Boolean(marked.pendingRepack)).toBe(true);
    expect(Boolean((await getByIdService(entry.id)).pendingRepack)).toBe(true);

    const filtered = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      pendingRepack: true,
    });
    expect(filtered.entries.map((e) => e.id)).toContain(entry.id);
    expect(filtered.counts.pendingRepack).toBeGreaterThanOrEqual(1);

    const unmarked = await setPendingRepackService(entry.id, false);
    expect(Boolean(unmarked.pendingRepack)).toBe(false);

    const filteredAfterUnmark = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      pendingRepack: true,
    });
    expect(filteredAfterUnmark.entries.map((e) => e.id)).not.toContain(entry.id);
  });

  it("setPendingRepackService rejects an unknown id with 404", async () => {
    await expect(setPendingRepackService(999999999, true)).rejects.toMatchObject({ status: 404 });
  });

  it("listService filters by os (exact match)", async () => {
    const uniqueOs = `VITEST_OS_${Date.now()}`;
    const a = await createService({ ip: testIp(), os: uniqueOs, entryType: "computer" });
    ipEntryId = a.id;

    const out = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      os: uniqueOs,
    });

    expect(out.entries.map((e) => e.id)).toContain(a.id);
    expect(out.total).toBe(1);
  });

  it("filterOptionsService includes a freshly-created distinct department/os value", async () => {
    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const uniqueOs = `VITEST_OS_${Date.now()}`;
    const entry = await createService({ ip: testIp(), department: uniqueDept, os: uniqueOs });
    ipEntryId = entry.id;

    const out = await filterOptionsService();
    expect(out.departments).toContain(uniqueDept);
    expect(out.os).toContain(uniqueOs);
  });

  it("listService filters by site", async () => {
    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const a = await createService({
      ip: testIp(),
      department: uniqueDept,
      site: "bolnica",
      entryType: "computer",
    });
    ipEntryId = a.id;
    const b = await createService({
      ip: testIp(),
      department: uniqueDept,
      site: "dom_zdravlja",
      entryType: "computer",
    });
    ipEntryId2 = b.id;

    const out = await listService({
      page: 1,
      limit: 50,
      sortBy: "ip",
      sortOrder: "asc",
      status: "all",
      entryType: "all",
      department: uniqueDept,
      site: "bolnica",
    });

    const ids = out.entries.map((e) => e.id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
  });

  it("duplicatesService does NOT flag the same computer name existing once per site as a duplicate", async () => {
    const uniqueName = `VITEST-DUP-${Date.now()}`;
    const a = await createService({
      ip: testIp(),
      computerName: uniqueName,
      site: "bolnica",
      entryType: "computer",
    });
    ipEntryId = a.id;
    const b = await createService({
      ip: testIp(),
      computerName: uniqueName,
      site: "dom_zdravlja",
      entryType: "computer",
    });
    ipEntryId2 = b.id;

    const bolnicaOut = await duplicatesService({ search: "", status: "all", site: "bolnica" });
    const bolnicaGroup = bolnicaOut.groups.find(
      (g) => g.name.toLowerCase() === uniqueName.toLowerCase(),
    );
    expect(bolnicaGroup).toBeUndefined();

    const dzOut = await duplicatesService({ search: "", status: "all", site: "dom_zdravlja" });
    const dzGroup = dzOut.groups.find((g) => g.name.toLowerCase() === uniqueName.toLowerCase());
    expect(dzGroup).toBeUndefined();
  });

  describe("freeIpAddressesService", () => {
    it("excludes an occupied address, and never includes the network/broadcast boundary addresses", async () => {
      // Realan opseg bolnice (10.230.62.0/23) - adresa blizu kraja opsega,
      // van dometa testIp()-a (203.0.113.x), pa mora ručno da se koristi
      // stvarna adresa iz opsega da bi test bio smislen.
      const testAddress = "10.230.63.253";
      const entry = await createService({ ip: testAddress, site: "bolnica", entryType: "computer" });
      ipEntryId = entry.id;

      const out = await freeIpAddressesService("bolnica");
      expect(out.site).toBe("bolnica");
      // /23 = 512 adresa - mrežna i broadcast = 510 upotrebljivih.
      expect(out.total).toBe(510);
      expect(out.freeIps).not.toContain(testAddress);
      expect(out.freeIps).not.toContain("10.230.62.0");
      expect(out.freeIps).not.toContain("10.230.63.255");
      expect(out.freeIps.length).toBe(out.total - out.occupiedCount);
    });

    it("rejects an unknown site", async () => {
      await expect(freeIpAddressesService("nonexistent")).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("repackRecommendationsService", () => {
    it("flags a Windows 11 computer with a weak CPU (Celeron) as a recommendation", async () => {
      const hostname = testHostname();
      const entry = await createService({
        ip: testIp(),
        computerName: hostname,
        site: "bolnica",
        entryType: "computer",
        os: "Microsoft Windows 11 Pro",
      });
      ipEntryId = entry.id;
      await upsertMetadataForIpEntry(ipEntryId, {
        CPU: { Name: "Intel(R) Celeron(R) CPU G4900 CPU @ 3.10GHz" },
        System: { TotalRAM_GB: 8 },
      });

      const out = await repackRecommendationsService("bolnica");
      const match = out.find((r) => r.id === ipEntryId);
      expect(match).toBeTruthy();
      expect(match.cpuTier).toBe("weak");
      expect(match.reasons).toContain("weak_cpu");
      expect(match.reasons).not.toContain("low_ram");
    });

    it("flags a Windows 10 computer with less than 8GB RAM (below the usable-RAM threshold) as a recommendation", async () => {
      const hostname = testHostname();
      const entry = await createService({
        ip: testIp(),
        computerName: hostname,
        site: "bolnica",
        entryType: "computer",
        os: "Microsoft Windows 10 Pro",
      });
      ipEntryId = entry.id;
      await upsertMetadataForIpEntry(ipEntryId, {
        CPU: { Name: "Intel(R) Core(TM) i5-10500 CPU @ 3.10GHz" },
        System: { TotalRAM_GB: 3.9 },
      });

      const out = await repackRecommendationsService("bolnica");
      const match = out.find((r) => r.id === ipEntryId);
      expect(match).toBeTruthy();
      expect(match.cpuTier).toBe("strong");
      expect(match.reasons).toContain("low_ram");
      expect(match.reasons).not.toContain("weak_cpu");
    });

    it("does NOT flag a real ~8GB machine (usable RAM reported just under 8) as low RAM", async () => {
      const hostname = testHostname();
      const entry = await createService({
        ip: testIp(),
        computerName: hostname,
        site: "bolnica",
        entryType: "computer",
        os: "Microsoft Windows 11 Pro",
      });
      ipEntryId = entry.id;
      await upsertMetadataForIpEntry(ipEntryId, {
        CPU: { Name: "Intel(R) Core(TM) i5-10500 CPU @ 3.10GHz" },
        System: { TotalRAM_GB: 7.8 },
      });

      const out = await repackRecommendationsService("bolnica");
      expect(out.find((r) => r.id === ipEntryId)).toBeUndefined();
    });

    it("does NOT flag a strong-CPU, well-RAM'd Windows 7 machine (wrong OS) or a weak-CPU Windows 7 machine (excluded by OS filter)", async () => {
      const hostname = testHostname();
      const entry = await createService({
        ip: testIp(),
        computerName: hostname,
        site: "bolnica",
        entryType: "computer",
        os: "Microsoft Windows 7 Professional",
      });
      ipEntryId = entry.id;
      await upsertMetadataForIpEntry(ipEntryId, {
        CPU: { Name: "Intel(R) Celeron(R) CPU G4900 CPU @ 3.10GHz" },
        System: { TotalRAM_GB: 2 },
      });

      const out = await repackRecommendationsService("bolnica");
      expect(out.find((r) => r.id === ipEntryId)).toBeUndefined();
    });
  });

  describe("agentId (home page -> agent link)", () => {
    let agentId;

    afterEach(async () => {
      await deleteTestAgent(agentId);
      agentId = undefined;
    });

    it("exposes agentId when an active agent is linked to the ip_entry", async () => {
      const ip = testIp();
      const entry = await createService({ ip, entryType: "computer" });
      ipEntryId = entry.id;

      agentId = await insertAgent({
        agentUid: crypto.randomUUID(),
        apiKeyHash: "test-hash",
        hostname: testHostname(),
        osCaption: null,
        osVersion: null,
        osBuild: null,
        agentVersion: null,
      });
      await linkAgentToIpEntry(agentId, ipEntryId);

      const out = await listService({
        page: 1,
        limit: 50,
        sortBy: "ip",
        sortOrder: "asc",
        status: "all",
        entryType: "all",
        search: ip,
      });
      const found = out.entries.find((e) => e.id === ipEntryId);
      expect(found.agentId).toBe(agentId);
    });

    it("does not expose a revoked agent's id (only active agents link)", async () => {
      const ip = testIp();
      const entry = await createService({ ip, entryType: "computer" });
      ipEntryId = entry.id;

      agentId = await insertAgent({
        agentUid: crypto.randomUUID(),
        apiKeyHash: "test-hash",
        hostname: testHostname(),
        osCaption: null,
        osVersion: null,
        osBuild: null,
        agentVersion: null,
      });
      await linkAgentToIpEntry(agentId, ipEntryId);
      await revokeAgentById(agentId);

      const out = await listService({
        page: 1,
        limit: 50,
        sortBy: "ip",
        sortOrder: "asc",
        status: "all",
        entryType: "all",
        search: ip,
      });
      const found = out.entries.find((e) => e.id === ipEntryId);
      expect(found.agentId).toBeNull();
    });

    it("leaves agentId null for a computer with no agent at all", async () => {
      const ip = testIp();
      const entry = await createService({ ip, entryType: "computer" });
      ipEntryId = entry.id;

      const out = await listService({
        page: 1,
        limit: 50,
        sortBy: "ip",
        sortOrder: "asc",
        status: "all",
        entryType: "all",
        search: ip,
      });
      const found = out.entries.find((e) => e.id === ipEntryId);
      expect(found.agentId).toBeNull();
    });
  });
});
