import { describe, it, expect, afterEach } from "vitest";
import {
  enrollAgent,
  heartbeat,
  syncAgentInventory,
  getAgentService,
  revokeAgentService,
  listAgentsService,
  listAgentIdsService,
  setAgentDeploymentGroupService,
  setAgentProcessKillExemptService,
  agentFilterOptionsService,
} from "../../services/agents.service.js";
import {
  findAgentById,
  linkAgentToIpEntry,
  updateAgentServiceFilesMismatch,
} from "../../repositories/agents.repo.js";
import {
  createService as createIpEntryService,
  getByIdService as getIpEntryByIdService,
} from "../../services/ipAddresses.service.js";
import { upsertMetadataForIpEntry } from "../../services/metadata.service.js";
import { pool } from "../../db/pool.js";
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

  it("heartbeat response reflects processKillExempt as a real boolean (not raw TINYINT 0/1)", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const byUid = await findAgentByUid(enrolled.agentId);
    agentId = byUid.id;

    const before = await heartbeat(agentId, {}, "10.230.62.81");
    expect(before.agent.processKillExempt).toBe(false);

    await setAgentProcessKillExemptService(agentId, true);

    const after = await heartbeat(agentId, {}, "10.230.62.81");
    expect(after.agent.processKillExempt).toBe(true);
  });

  it("the global process_monitor_enabled setting forces processKillExempt=true fleet-wide when off, regardless of the per-agent flag", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const byUid = await findAgentByUid(enrolled.agentId);
    agentId = byUid.id;

    const { updateSettingService } = await import("../../services/appSettings.service.js");
    try {
      // Baseline: default-enabled monitor, agent NOT individually exempt.
      const enabled = await heartbeat(agentId, {}, "10.230.62.81");
      expect(enabled.agent.processKillExempt).toBe(false);

      await updateSettingService("process_monitor_enabled", false, null);
      const disabled = await heartbeat(agentId, {}, "10.230.62.81");
      expect(disabled.agent.processKillExempt).toBe(true);

      await updateSettingService("process_monitor_enabled", true, null);
      const reenabled = await heartbeat(agentId, {}, "10.230.62.81");
      expect(reenabled.agent.processKillExempt).toBe(false);
    } finally {
      await pool.execute("DELETE FROM app_settings WHERE setting_key = 'process_monitor_enabled'");
    }
  });

  it("setAgentProcessKillExemptService toggles the flag and rejects an unknown agent", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const byUid = await findAgentByUid(enrolled.agentId);
    agentId = byUid.id;

    const updated = await setAgentProcessKillExemptService(agentId, true);
    expect(Boolean(updated.processKillExempt)).toBe(true);

    const reverted = await setAgentProcessKillExemptService(agentId, false);
    expect(Boolean(reverted.processKillExempt)).toBe(false);

    await expect(
      setAgentProcessKillExemptService(999999999, true),
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

  it("getAgentService reports windowsUpdateStatus/computerIp/site from linked ip_entry, null when unlinked", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const unlinked = await getAgentService(agentId);
    expect(unlinked.windowsUpdateStatus).toBeNull();
    expect(unlinked.computerIp).toBeNull();
    expect(unlinked.site).toBeNull();

    const ip = testIp();
    const entry = await createIpEntryService({
      ip,
      site: "bolnica",
      entryType: "computer",
      computerName: hostname,
    });
    ipEntryId = entry.id;
    await linkAgentToIpEntry(agentId, ipEntryId);
    await upsertMetadataForIpEntry(ipEntryId, { WindowsUpdate: { ServiceStatus: "Stopped" } });

    const linked = await getAgentService(agentId);
    expect(linked.windowsUpdateStatus).toBe("Stopped");
    expect(linked.computerIp).toBe(ip);
    expect(linked.site).toBe("bolnica");
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

  it("infers site by IP range only for a brand-new ip_entries row, never overwrites an existing one", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    // Dev baza sada ima i pravu (produkcijsku) kopiju podataka - ne sme se
    // slučajno pogoditi IP koji već pripada nekom stvarnom unosu, zato
    // provera slobodne adrese pre nego što se odabere.
    const { findIpEntryIdByIp } = await import("../../repositories/ipEntries.repo.js");
    let domZdravljaIp;
    for (let host = 250; host >= 1; host--) {
      const candidate = `10.160.64.${host}`;
      if (!(await findIpEntryIdByIp(candidate))) {
        domZdravljaIp = candidate;
        break;
      }
    }
    expect(domZdravljaIp).toBeTruthy();

    const firstSync = await syncAgentInventory(found, { ip: domZdravljaIp, hostname });
    ipEntryId = firstSync.ipEntryId;

    const entry = await getIpEntryByIdService(ipEntryId);
    expect(entry.site).toBe("dom_zdravlja");

    // Admin ručno ispravlja site (npr. mašina fizički prebačena) - sledeći
    // sync sa ISTE IP adrese ne sme da ga vrati na pretpostavljenu vrednost.
    await pool.execute("UPDATE ip_entries SET site = 'bolnica' WHERE id = ?", [ipEntryId]);
    const reloaded = await findAgentById(agentId);
    await syncAgentInventory(reloaded, { ip: domZdravljaIp, hostname });
    const afterResync = await getIpEntryByIdService(ipEntryId);
    expect(afterResync.site).toBe("bolnica");
  });

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

  it(
    "inventory sync auto-fills ip_entries.os from OS.Caption and rdp_app from detected " +
      "remote-access services, then a services-less sync leaves both untouched",
    async () => {
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
        services: [
          { name: "AnyDesk Service", displayName: "AnyDesk", state: "Running" },
          { name: "TeamViewer", displayName: "TeamViewer", state: "Running" },
          { name: "Spooler", displayName: "Print Spooler", state: "Running" },
        ],
      });
      ipEntryId = fullSync.ipEntryId;

      let entry = await getIpEntryByIdService(ipEntryId);
      expect(entry.os).toBe("Microsoft Windows 10 Pro");
      expect(entry.rdpApp).toBe("AnyDesk, TeamViewer");

      // A sync that includes NO services array at all (e.g. an event-log-only
      // ping) must not wipe the previously-detected rdp_app/os - same
      // merge-not-overwrite contract as computer_name/department.
      const reloaded = await findAgentById(agentId);
      await syncAgentInventory(reloaded, { ip, eventLogs: [{ logName: "System" }] });

      entry = await getIpEntryByIdService(ipEntryId);
      expect(entry.os).toBe("Microsoft Windows 10 Pro");
      expect(entry.rdpApp).toBe("AnyDesk, TeamViewer");

      // A later sync that DOES include services, but none matching any known
      // tool, clears rdp_app back to null (full replace, not additive).
      const reloadedAgain = await findAgentById(agentId);
      await syncAgentInventory(reloadedAgain, {
        ip,
        services: [{ name: "Spooler", displayName: "Print Spooler", state: "Running" }],
      });

      entry = await getIpEntryByIdService(ipEntryId);
      expect(entry.rdpApp).toBeNull();
    },
  );

  it(
    "inventory sync auto-fills ip_entries.os_architecture and has_izvolte_folder, " +
      "then a sync without those fields leaves both untouched (not falsely reset to null/false)",
    async () => {
      const ip = testIp();
      const hostname = testHostname();

      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const fullSync = await syncAgentInventory(found, {
        ip,
        hostname,
        OS: { Caption: "Microsoft Windows 10 Pro", Architecture: "64-bit" },
        hasIzvolteFolder: true,
      });
      ipEntryId = fullSync.ipEntryId;

      let entry = await getIpEntryByIdService(ipEntryId);
      expect(entry.osArchitecture).toBe("64-bit");
      expect(Boolean(entry.hasIzvolteFolder)).toBe(true);

      // A minimal sync (e.g. event-log-only, exactly how AgentWorker.cs builds
      // its lightweight requests) omits OS/hasIzvolteFolder entirely - must not
      // wipe either field, same merge-not-overwrite contract as os/rdp_app.
      const reloaded = await findAgentById(agentId);
      await syncAgentInventory(reloaded, { ip, eventLogs: [{ logName: "System" }] });

      entry = await getIpEntryByIdService(ipEntryId);
      expect(entry.osArchitecture).toBe("64-bit");
      expect(Boolean(entry.hasIzvolteFolder)).toBe(true);

      // A later real sync reporting the folder is now gone DOES flip it back.
      const reloadedAgain = await findAgentById(agentId);
      await syncAgentInventory(reloadedAgain, { ip, hasIzvolteFolder: false });

      entry = await getIpEntryByIdService(ipEntryId);
      expect(Boolean(entry.hasIzvolteFolder)).toBe(false);
    },
  );

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

    // Deployment grupa je sada slobodan tekst (usklađena sa stvarnim
    // odeljenjima), ne fiksna test/it/pilot/rest enumeracija - ovaj test
    // potvrđuje da filtriranje radi i za proizvoljno ime odeljenja.
    it("filters by an arbitrary (department-like) deploymentGroup value, not just the classic ones", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const customGroup = `VITEST_DEPT_${Date.now()}`;
      await setAgentDeploymentGroupService(agentId, customGroup);

      const matched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        deploymentGroup: customGroup,
      });
      expect(matched.items.map((a) => a.id)).toContain(agentId);
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

    it("filters by antivirusInactive (agent_monitoring.antivirus_status != 'enabled', including no data yet)", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      // Nema još monitoring podataka - i dalje treba da se pojavi (NULL se
      // tretira kao "nije potvrđeno aktivan", ne kao "propušteno").
      const noDataYet = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", antivirusInactive: true,
      });
      expect(noDataYet.items.map((a) => a.id)).toContain(agentId);

      await heartbeat(agentId, { monitoring: { antivirusStatus: "disabled" } }, "10.230.62.81");
      const disabled = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", antivirusInactive: true,
      });
      expect(disabled.items.map((a) => a.id)).toContain(agentId);

      await heartbeat(agentId, { monitoring: { antivirusStatus: "enabled" } }, "10.230.62.81");
      const enabledNow = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", antivirusInactive: true,
      });
      expect(enabledNow.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by firewallInactive (agent_monitoring.firewall_status != 'enabled')", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      await heartbeat(agentId, { monitoring: { firewallStatus: "disabled" } }, "10.230.62.81");
      const disabled = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", firewallInactive: true,
      });
      expect(disabled.items.map((a) => a.id)).toContain(agentId);

      await heartbeat(agentId, { monitoring: { firewallStatus: "enabled" } }, "10.230.62.81");
      const enabledNow = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", firewallInactive: true,
      });
      expect(enabledNow.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by windowsUpdateInactive (computer_metadata.wu_service_status != 'Running', joined via agents.ip_entry_id)", async () => {
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

      await upsertMetadataForIpEntry(ipEntryId, { WindowsUpdate: { ServiceStatus: "Stopped" } });
      const stopped = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", windowsUpdateInactive: true,
      });
      expect(stopped.items.map((a) => a.id)).toContain(agentId);

      await upsertMetadataForIpEntry(ipEntryId, { WindowsUpdate: { ServiceStatus: "Running" } });
      const running = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", windowsUpdateInactive: true,
      });
      expect(running.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by agentOfflineIpOnline (agent not online while its ip_entries.is_online = 1 - possible agent malfunction)", async () => {
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

      // Agent nikad nije poslao heartbeat -> connectivityStatus 'unknown',
      // ne 'online' - dok je ip_entries.is_online = 1 = mismatch.
      const mismatch = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", agentOfflineIpOnline: true,
      });
      expect(mismatch.items.map((a) => a.id)).toContain(agentId);

      // Agent se javi online preko heartbeat-a -> mismatch nestaje (oba
      // signala se sad slažu).
      await heartbeat(agentId, {}, "10.230.62.81");
      const resolved = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", agentOfflineIpOnline: true,
      });
      expect(resolved.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by serviceFilesMismatch", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const before = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", serviceFilesMismatch: true,
      });
      expect(before.items.map((a) => a.id)).not.toContain(agentId);

      await updateAgentServiceFilesMismatch(agentId, true, "Missing DLL");
      const mismatch = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", serviceFilesMismatch: true,
      });
      expect(mismatch.items.map((a) => a.id)).toContain(agentId);

      await updateAgentServiceFilesMismatch(agentId, false, null);
      const resolved = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", serviceFilesMismatch: true,
      });
      expect(resolved.items.map((a) => a.id)).not.toContain(agentId);
    });

    it("filters by processKillExempt", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const before = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", processKillExempt: true,
      });
      expect(before.items.map((a) => a.id)).not.toContain(agentId);

      await setAgentProcessKillExemptService(agentId, true);
      const exempt = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", processKillExempt: true,
      });
      expect(exempt.items.map((a) => a.id)).toContain(agentId);

      await setAgentProcessKillExemptService(agentId, false);
      const resolved = await listAgentsService({
        page: 1, limit: 50, search: hostname, status: "all", processKillExempt: true,
      });
      expect(resolved.items.map((a) => a.id)).not.toContain(agentId);
    });

    it(
      "filters by archGroup, populated from the OS.Architecture already reported " +
        "on inventory sync (no separate agent-side field)",
      async () => {
        const ip = testIp();
        const hostname = testHostname();
        const enrolled = await enrollAgent({ hostname });
        const { findAgentByUid } = await import("../../repositories/agents.repo.js");
        const found = await findAgentByUid(enrolled.agentId);
        agentId = found.id;

        const before = await listAgentsService({
          page: 1, limit: 50, search: hostname, status: "all", archGroup: "x64",
        });
        expect(before.items.map((a) => a.id)).not.toContain(agentId);

        const synced = await syncAgentInventory(found, {
          ip,
          hostname,
          OS: { Caption: "Microsoft Windows 10 Pro", Architecture: "64-bit" },
        });
        ipEntryId = synced.ipEntryId;

        const matched = await listAgentsService({
          page: 1, limit: 50, search: hostname, status: "all", archGroup: "x64",
        });
        expect(matched.items.map((a) => a.id)).toContain(agentId);
        const matchedAgent = matched.items.find((a) => a.id === agentId);
        expect(matchedAgent.extraGroups).toBe("x64");

        const notX86 = await listAgentsService({
          page: 1, limit: 50, search: hostname, status: "all", archGroup: "x86",
        });
        expect(notX86.items.map((a) => a.id)).not.toContain(agentId);

        // Sledeći sync sa drugom arhitekturom (npr. re-imaged mašina)
        // zamenjuje stari tag umesto da ga dodaje uz novi.
        const reloaded = await findAgentById(agentId);
        await syncAgentInventory(reloaded, {
          ip,
          OS: { Caption: "Microsoft Windows 10 Pro", Architecture: "32-bit" },
        });
        const switched = await getAgentService(agentId);
        expect(switched.extraGroups).toBe("x86");
      },
    );

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

  describe("listAgentIdsService (select-all-across-pages)", () => {
    it("returns matching ids unpaginated, ignoring page/limit entirely", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname, osCaption: "VITEST_TEST_OS_SelectAll" });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const matched = await listAgentIdsService({
        search: hostname,
        status: "all",
        os: "VITEST_TEST_OS_SelectAll",
      });
      expect(matched.ids).toEqual([agentId]);

      const notMatched = await listAgentIdsService({
        search: hostname,
        status: "all",
        os: "Some Other OS",
      });
      expect(notMatched.ids).toEqual([]);
    });
  });

  describe("department filter (joined from ip_entries via agents.ip_entry_id)", () => {
    it("filters listAgentsService/listAgentIdsService by department", async () => {
      const ip = testIp();
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const sync = await syncAgentInventory(found, {
        ip,
        hostname,
        department: "VITEST_TEST_DEPT",
      });
      ipEntryId = sync.ipEntryId;

      const matched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        department: "VITEST_TEST_DEPT",
      });
      expect(matched.items.map((a) => a.id)).toContain(agentId);
      expect(matched.items.find((a) => a.id === agentId).department).toBe("VITEST_TEST_DEPT");

      const notMatched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        department: "Some Other Department",
      });
      expect(notMatched.items.map((a) => a.id)).not.toContain(agentId);

      const ids = await listAgentIdsService({
        search: hostname,
        status: "all",
        department: "VITEST_TEST_DEPT",
      });
      expect(ids.ids).toEqual([agentId]);
    });
  });

  describe("site filter (joined from ip_entries via agents.ip_entry_id)", () => {
    it("filters listAgentsService/listAgentIdsService by site", async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      agentId = found.id;

      const entry = await createIpEntryService({
        ip: testIp(),
        site: "dom_zdravlja",
        entryType: "computer",
      });
      ipEntryId = entry.id;
      await linkAgentToIpEntry(agentId, ipEntryId);

      const matched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        site: "dom_zdravlja",
      });
      expect(matched.items.map((a) => a.id)).toContain(agentId);

      const notMatched = await listAgentsService({
        page: 1,
        limit: 50,
        search: hostname,
        status: "all",
        site: "bolnica",
      });
      expect(notMatched.items.map((a) => a.id)).not.toContain(agentId);

      const ids = await listAgentIdsService({
        search: hostname,
        status: "all",
        site: "dom_zdravlja",
      });
      expect(ids.ids).toEqual([agentId]);
    });
  });

  it("agentFilterOptionsService suggests deployment groups from classic values, agent groups in use, AND departments", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    agentId = found.id;

    const customGroup = `VITEST_GROUP_${Date.now()}`;
    await setAgentDeploymentGroupService(agentId, customGroup);

    const uniqueDept = `VITEST_DEPT_${Date.now()}`;
    const entry = await createIpEntryService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      department: uniqueDept,
    });
    ipEntryId = entry.id;

    const out = await agentFilterOptionsService();
    expect(out.deploymentGroups).toEqual(expect.arrayContaining(["test", "it", "pilot", "rest"]));
    expect(out.deploymentGroups).toContain(customGroup);
    expect(out.deploymentGroups).toContain(uniqueDept);
  });
});
