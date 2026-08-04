import { describe, it, expect, afterEach } from "vitest";
import { createService as createIpEntryService } from "../../services/ipAddresses.service.js";
import { ingestDnsQueries, addFlaggedDomainService } from "../../services/dnsLogs.service.js";
import { listNotifications } from "../../services/notifications.service.js";
import { enrollAgent, heartbeat } from "../../services/agents.service.js";
import { linkAgentToIpEntry } from "../../repositories/agents.repo.js";
import {
  countBlacklistedDomainHits,
  listBlacklistedDomainHits,
  countAgentOfflineButIpOnline,
} from "../../repositories/notifications.repo.js";
import { deleteTestIpEntry, deleteTestAgent, testIp, testHostname } from "../helpers/testDb.js";
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

  it("listBlacklistedDomainHits returns which computer visited which blacklisted domain, scoped by site and recency", async () => {
    await addFlaggedDomainService({ domain: blacklisted }, null);

    const entry = await createIpEntryService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: "VITEST-BLACKLIST-PC",
    });
    ipEntryId = entry.id;
    await ingestDnsQueries(ipEntryId, [
      { domain: blacklisted, firstSeen: new Date(), lastSeen: new Date(), count: 3 },
    ]);

    const bolnica = await listBlacklistedDomainHits(24, "bolnica");
    const row = bolnica.find((r) => r.ipEntryId === ipEntryId);
    expect(row).toBeTruthy();
    expect(row.domain).toBe(blacklisted);
    expect(row.computerName).toBe("VITEST-BLACKLIST-PC");
    expect(row.queryCount).toBe(3);

    const domZdravlja = await listBlacklistedDomainHits(24, "dom_zdravlja");
    expect(domZdravlja.some((r) => r.ipEntryId === ipEntryId)).toBe(false);
  });
});

describe("notifications (integration, real DB) - possible agent malfunction check", () => {
  let ipEntryId;
  let agentId;

  afterEach(async () => {
    await deleteTestAgent(agentId);
    agentId = undefined;
    await deleteTestIpEntry(ipEntryId);
    ipEntryId = undefined;
  });

  it("countAgentOfflineButIpOnline counts an agent that hasn't reported online while its computer is reachable on the network, scoped by site", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const entry = await createIpEntryService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: hostname,
    });
    ipEntryId = entry.id;
    await linkAgentToIpEntry(agentId, ipEntryId);
    await pool.execute("UPDATE ip_entries SET is_online = 1 WHERE id = ?", [ipEntryId]);

    const bolnica = await countAgentOfflineButIpOnline("bolnica");
    expect(bolnica).toBeGreaterThanOrEqual(1);

    const domZdravlja = await countAgentOfflineButIpOnline("dom_zdravlja");
    expect(domZdravlja).toBe(0);

    // Agent se javi online -> više nije mismatch.
    await heartbeat(agentId, {}, "10.230.62.81");
    const afterHeartbeat = await countAgentOfflineButIpOnline("bolnica");
    expect(afterHeartbeat).toBe(bolnica - 1);
  });

  it("listNotifications includes an agent-offline-ip-online entry when there's a mismatch", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const entry = await createIpEntryService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: hostname,
    });
    ipEntryId = entry.id;
    await linkAgentToIpEntry(agentId, ipEntryId);
    await pool.execute("UPDATE ip_entries SET is_online = 1 WHERE id = ?", [ipEntryId]);

    const out = await listNotifications("bolnica");
    const found2 = out.notifications.find((n) => n.id === "agent-offline-ip-online");
    expect(found2).toBeTruthy();
    expect(found2.level).toBe("warning");
  });
});
