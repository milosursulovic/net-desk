import { describe, it, expect, afterEach } from "vitest";
import { createService as createIpEntryService } from "../../services/ipAddresses.service.js";
import {
  ingestDnsQueries,
  listDnsQueriesService,
  addFlaggedDomainService,
  removeFlaggedDomainService,
} from "../../services/dnsLogs.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

async function deleteFlaggedDomainByName(domain) {
  await pool.execute("DELETE FROM flagged_domains WHERE domain = ?", [domain]);
}

describe("dnsLogs.service (integration, real DB)", () => {
  let ipEntryId;

  afterEach(async () => {
    // computer_dns_queries.ip_entry_id has ON DELETE CASCADE - deleting the
    // ip_entries row is enough cleanup.
    await deleteTestIpEntry(ipEntryId);
    ipEntryId = undefined;
  });

  it("ingestDnsQueries aggregates the same domain synced twice into ONE row (count sums, lastSeen advances)", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const uniqueDomain = `vitest-dns-${Date.now()}.example.com`;

    await ingestDnsQueries(ipEntryId, [
      {
        domain: uniqueDomain,
        firstSeen: "2026-01-01T00:00:00.000Z",
        lastSeen: "2026-01-01T00:00:00.000Z",
        count: 2,
      },
    ]);

    await ingestDnsQueries(ipEntryId, [
      {
        domain: uniqueDomain,
        firstSeen: "2026-01-01T00:10:00.000Z",
        lastSeen: "2026-01-01T00:10:00.000Z",
        count: 3,
      },
    ]);

    const out = await listDnsQueriesService({ search: uniqueDomain, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].queryCount).toBe(5);
    expect(new Date(out.items[0].lastSeen).getTime()).toBe(new Date("2026-01-01T00:10:00.000Z").getTime());
    expect(new Date(out.items[0].firstSeen).getTime()).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  it("ingestDnsQueries normalizes domain casing/trailing whitespace so re-sends still dedupe", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    const baseDomain = `vitest-dns-case-${Date.now()}.example.com`;

    await ingestDnsQueries(ipEntryId, [
      { domain: `  ${baseDomain.toUpperCase()}  `, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);
    await ingestDnsQueries(ipEntryId, [
      { domain: baseDomain, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const out = await listDnsQueriesService({ search: baseDomain, page: 1, limit: 50 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0].domain).toBe(baseDomain);
    expect(out.items[0].queryCount).toBe(2);
  });

  it("listDnsQueriesService filters by site (joined from ip_entries)", async () => {
    const uniqueDomain = `vitest-dns-site-${Date.now()}.example.com`;

    const a = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = a.id;
    await ingestDnsQueries(a.id, [
      { domain: uniqueDomain, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const matched = await listDnsQueriesService({ search: uniqueDomain, site: "bolnica", page: 1, limit: 50 });
    expect(matched.items).toHaveLength(1);

    const notMatched = await listDnsQueriesService({ search: uniqueDomain, site: "dom_zdravlja", page: 1, limit: 50 });
    expect(notMatched.items).toHaveLength(0);
  });

  it("ingestDnsQueries skips entries with an empty/missing domain", async () => {
    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;

    await expect(
      ingestDnsQueries(ipEntryId, [{ domain: "", firstSeen: new Date(), lastSeen: new Date(), count: 1 }]),
    ).resolves.toBe(true);

    const out = await listDnsQueriesService({ search: "", page: 1, limit: 1000 });
    expect(out.items.every((i) => i.ipEntryId !== ipEntryId)).toBe(true);
  });

  describe("crna lista domena (flagged_domains)", () => {
    afterEach(async () => {
      await deleteFlaggedDomainByName("vitest-blacklisted.example.com");
    });

    it("addFlaggedDomainService rejects a duplicate (case-insensitive)", async () => {
      const domain = "vitest-blacklisted.example.com";
      await addFlaggedDomainService({ domain }, null);

      await expect(
        addFlaggedDomainService({ domain: domain.toUpperCase() }, null),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("removeFlaggedDomainService deletes the entry", async () => {
      const domain = "vitest-blacklisted.example.com";
      const created = await addFlaggedDomainService({ domain }, null);

      const out = await removeFlaggedDomainService(created.id);
      expect(out.affected).toBe(1);
    });

    it("listDnsQueriesService marks exact AND subdomain matches as isBlacklisted, but not unrelated domains", async () => {
      const blacklisted = "vitest-blacklisted.example.com";
      await addFlaggedDomainService({ domain: blacklisted }, null);

      const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
      ipEntryId = entry.id;

      const subdomain = `sub.${blacklisted}`;
      const unrelated = `not-${blacklisted}`; // shares the substring but is NOT a subdomain

      await ingestDnsQueries(ipEntryId, [
        { domain: blacklisted, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
        { domain: subdomain, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
        { domain: unrelated, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
      ]);

      const out = await listDnsQueriesService({ search: blacklisted, page: 1, limit: 50 });
      const byDomain = Object.fromEntries(out.items.map((i) => [i.domain, i]));

      expect(byDomain[blacklisted].isBlacklisted).toBe(true);
      expect(byDomain[subdomain].isBlacklisted).toBe(true);
      expect(byDomain[unrelated].isBlacklisted).toBe(false);
    });
  });
});
