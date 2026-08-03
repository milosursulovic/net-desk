import { describe, it, expect, afterEach } from "vitest";
import { createService as createIpEntryService } from "../../services/ipAddresses.service.js";
import { ingestDnsQueries, addFlaggedDomainService } from "../../services/dnsLogs.service.js";
import { listNotifications } from "../../services/notifications.service.js";
import { countBlacklistedDomainHits } from "../../repositories/notifications.repo.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

async function deleteFlaggedDomainByName(domain) {
  await pool.execute("DELETE FROM flagged_domains WHERE domain = ?", [domain]);
}

describe("notifications (integration, real DB) - blacklisted domain check", () => {
  let ipEntryId;
  const blacklisted = "vitest-notif-blacklisted.example.com";

  afterEach(async () => {
    await deleteTestIpEntry(ipEntryId);
    ipEntryId = undefined;
    await deleteFlaggedDomainByName(blacklisted);
  });

  it("countBlacklistedDomainHits counts a computer that recently visited a blacklisted domain, scoped by site", async () => {
    await addFlaggedDomainService({ domain: blacklisted }, null);

    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;
    await ingestDnsQueries(ipEntryId, [
      { domain: blacklisted, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const bolnica = await countBlacklistedDomainHits(24, "bolnica");
    expect(bolnica).toBeGreaterThanOrEqual(1);

    const domZdravlja = await countBlacklistedDomainHits(24, "dom_zdravlja");
    expect(domZdravlja).toBe(0);
  });

  it("countBlacklistedDomainHits ignores hits outside the recency window", async () => {
    await addFlaggedDomainService({ domain: blacklisted }, null);

    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;
    const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await ingestDnsQueries(ipEntryId, [
      { domain: blacklisted, firstSeen: longAgo, lastSeen: longAgo, count: 1 },
    ]);

    const recent = await countBlacklistedDomainHits(24, "bolnica");
    expect(recent).toBe(0);

    const wideWindow = await countBlacklistedDomainHits(72, "bolnica");
    expect(wideWindow).toBeGreaterThanOrEqual(1);
  });

  it("listNotifications includes a blacklisted-domain entry when there's a recent hit", async () => {
    await addFlaggedDomainService({ domain: blacklisted }, null);

    const entry = await createIpEntryService({ ip: testIp(), site: "bolnica", entryType: "computer" });
    ipEntryId = entry.id;
    await ingestDnsQueries(ipEntryId, [
      { domain: blacklisted, firstSeen: new Date(), lastSeen: new Date(), count: 1 },
    ]);

    const out = await listNotifications("bolnica");
    const found = out.notifications.find((n) => n.id === "blacklisted-domain");
    expect(found).toBeTruthy();
    expect(found.level).toBe("critical");
  });
});
