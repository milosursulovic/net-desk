import { describe, it, expect, afterEach } from "vitest";
import {
  enrollAgent,
  heartbeat,
  syncAgentInventory,
  getAgentService,
  revokeAgentService,
  listAgentsService,
  setAgentDeploymentGroupService,
} from "../../services/agents.service.js";
import { findAgentById } from "../../repositories/agents.repo.js";
import { deleteTestAgent, deleteTestIpEntry, testIp, testHostname } from "../helpers/testDb.js";

describe("agents.service (integration, real DB)", () => {
  let agentId;
  let ipEntryId;

  afterEach(async () => {
    await deleteTestAgent(agentId);
    await deleteTestIpEntry(ipEntryId);
    agentId = undefined;
    ipEntryId = undefined;
  });

  it("enrollAgent creates an agent and returns a one-time apiKey", async () => {
    const hostname = testHostname();
    const out = await enrollAgent({
      hostname,
      osCaption: "Microsoft Windows 10 Pro",
      osVersion: "10.0.19045",
      osBuild: "19045",
      agentVersion: "1.0.0",
    });

    expect(out.agentId).toBeTruthy();
    expect(out.apiKey).toMatch(/^[0-9a-f]{64}$/);

    // out.agentId is the public agent_uid, not the numeric PK - look up the
    // numeric id (needed for cleanup) and confirm the row landed correctly.
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const byUid = await findAgentByUid(out.agentId);
    agentId = byUid.id;

    const found = await findAgentById(agentId);
    expect(found.hostname).toBe(hostname);
    expect(found.osCaption).toBe("Microsoft Windows 10 Pro");
    expect(found.status).toBe("active");
  });

  it("heartbeat updates lastHeartbeatAt/hostname and rejects an unknown agent", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const byUid = await findAgentByUid(enrolled.agentId);
    agentId = byUid.id;

    const found = await findAgentById(agentId);
    expect(found.lastHeartbeatAt).toBeNull();

    const out = await heartbeat(
      agentId,
      { hostname: "NEW-HOSTNAME", agentVersion: "1.0.1" },
      "10.230.62.81",
    );
    expect(out.ok).toBe(true);
    expect(out.agent.status).toBe("active");

    const updated = await findAgentById(agentId);
    expect(updated.hostname).toBe("NEW-HOSTNAME");
    expect(updated.agentVersion).toBe("1.0.1");
    expect(updated.lastHeartbeatAt).not.toBeNull();

    await expect(
      heartbeat(999999999, {}, "10.230.62.81"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("getAgentService reports connectivityStatus=online right after a heartbeat", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    await heartbeat(agentId, {}, "10.230.62.81");

    const out = await getAgentService(agentId);
    expect(out.connectivityStatus).toBe("online");
  });

  it("revokeAgentService flips status to revoked", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const out = await revokeAgentService(agentId);
    expect(out.status).toBe("revoked");

    await expect(revokeAgentService(999999999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it(
    "a second full inventory sync correctly UPDATES previously-written metadata " +
      "(regression: patchMetadataForIpEntry's PascalCase-key-shadows-fresh-data bug)",
    async () => {
      // This is the exact bug found live: once a computer_metadata row exists
      // (so existing.OS is a real, if all-null, object from mapMeta), a
      // naive merge that checks the PascalCase key first can shadow fresh
      // data. The first sync for a machine worked (nothing to shadow it
      // yet); every sync after that silently wrote nothing. Root cause was
      // actually client-side (Newtonsoft overriding [JsonProperty] names -
      // see the windows-service memory) but this test locks in the
      // server-side merge contract regardless of where a payload comes from.
      const ip = testIp();
      const hostname = testHostname();

      let agent = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(agent.agentId);
      agentId = found.id;

      const firstSync = await syncAgentInventory(found, {
        ip,
        hostname,
        OS: { Caption: "Microsoft Windows 10 Pro", Version: "10.0.19045" },
        System: { Manufacturer: "HP", Model: "Pavilion Aero" },
        CPU: { Name: "AMD Ryzen 7 7735U" },
      });
      ipEntryId = firstSync.ipEntryId;
      expect(firstSync.metadata.OS.Caption).toBe("Microsoft Windows 10 Pro");

      // Re-fetch the agent the way the real auth middleware would on the
      // next request - now agent.ipEntryId is populated from the first sync.
      const reloaded = await findAgentById(agentId);
      expect(reloaded.ipEntryId).toBe(ipEntryId);

      const secondSync = await syncAgentInventory(reloaded, {
        ip,
        hostname,
        OS: { Caption: "Microsoft Windows 11 Pro", Version: "10.0.26100" },
        System: { Manufacturer: "HP", Model: "Pavilion Aero" },
        CPU: { Name: "AMD Ryzen 7 7735U" },
      });

      expect(secondSync.metadata.OS.Caption).toBe("Microsoft Windows 11 Pro");
      expect(secondSync.metadata.OS.Version).toBe("10.0.26100");
    },
  );

  it("a minimal event-log-only sync does not wipe previously-synced metadata (merge, not overwrite)", async () => {
    const ip = testIp();
    const hostname = testHostname();

    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const fullSync = await syncAgentInventory(found, {
      ip,
      hostname,
      OS: { Caption: "Microsoft Windows 10 Pro" },
      System: { Manufacturer: "HP" },
    });
    ipEntryId = fullSync.ipEntryId;

    const reloaded = await findAgentById(agentId);
    const minimalSync = await syncAgentInventory(reloaded, {
      ip,
      eventLogs: [{ logName: "System", level: "Error", message: "test" }],
    });

    // OS/System fields must survive an event-log-only sync untouched.
    expect(minimalSync.metadata.OS.Caption).toBe("Microsoft Windows 10 Pro");
    expect(minimalSync.metadata.System.Manufacturer).toBe("HP");
  });

  describe("listAgentsService detailed filters", () => {
    it("filters by connectivityStatus=online after a heartbeat, and excludes it under offline", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      await heartbeat(agentId, {}, "10.230.62.81");

      const online = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        connectivityStatus: "online",
      });
      expect(online.items.map((a) => a.id)).toContain(agentId);

      const offline = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        connectivityStatus: "offline",
      });
      expect(offline.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by deploymentGroup", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      await setAgentDeploymentGroupService(agentId, "pilot");

      const pilot = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        deploymentGroup: "pilot",
      });
      expect(pilot.items.map((a) => a.id)).toContain(agentId);

      const test = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        deploymentGroup: "test",
      });
      expect(test.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by os (exact match on osCaption)", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({
        hostname,
        osCaption: "VITEST_TEST_OS_Marker",
      });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const matched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        os: "VITEST_TEST_OS_Marker",
      });
      expect(matched.items.map((a) => a.id)).toContain(agentId);

      const notMatched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        os: "Some Other OS",
      });
      expect(notMatched.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by enrolledFrom/enrolledTo date range", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const today = new Date().toISOString().slice(0, 10);

      const withinRange = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        enrolledFrom: today,
        enrolledTo: today,
      });
      expect(withinRange.items.map((a) => a.id)).toContain(agentId);

      const outsideRange = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        enrolledTo: "2000-01-01",
      });
      expect(outsideRange.items.map((a) => a.id)).not.toContain(agentId);
    });
  });
});
