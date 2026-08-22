import { describe, it, expect, afterEach } from "vitest";
import { enrollManager, heartbeatManager, getManagerByIpEntryId } from "../../services/managers.service.js";
import { findManagerById } from "../../repositories/managers.repo.js";
import { pool } from "../../db/pool.js";
import { testIp, testHostname, deleteTestIpEntry } from "../helpers/testDb.js";

async function deleteTestManager(id) {
  if (!id) return;
  await pool.execute("DELETE FROM managers WHERE id = ?", [id]);
}

describe("managers.service (integration, real DB)", () => {
  let managerId;
  let ipEntryId;

  afterEach(async () => {
    await deleteTestManager(managerId);
    await deleteTestIpEntry(ipEntryId);
    managerId = undefined;
    ipEntryId = undefined;
  });

  it("enrollManager creates a manager row and resolves a NEW ip_entries row for a never-seen IP", async () => {
    const ip = testIp();
    const hostname = testHostname();

    const result = await enrollManager({ hostname, managerVersion: "1.0.0", ip });
    expect(result.managerId).toBeTruthy();
    expect(result.apiKey).toBeTruthy();

    const [[row]] = await pool.query(
      "SELECT id, manager_uid AS managerUid, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?",
      [result.managerId],
    );
    managerId = row.id;
    ipEntryId = row.ipEntryId;

    expect(row.ipEntryId).toBeTruthy();

    const [[ipRow]] = await pool.query("SELECT ip, computer_name AS computerName FROM ip_entries WHERE id = ?", [
      ipEntryId,
    ]);
    expect(ipRow.ip).toBe(ip);
    expect(ipRow.computerName).toBe(hostname);
  });

  it("enrollManager links to an EXISTING ip_entries row instead of duplicating it", async () => {
    const ip = testIp();

    const first = await enrollManager({ hostname: testHostname(), managerVersion: "1.0.0", ip });
    const [[firstRow]] = await pool.query("SELECT id, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?", [
      first.managerId,
    ]);

    const second = await enrollManager({ hostname: testHostname(), managerVersion: "1.0.0", ip });
    const [[secondRow]] = await pool.query(
      "SELECT id, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?",
      [second.managerId],
    );

    expect(secondRow.ipEntryId).toBe(firstRow.ipEntryId);

    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM ip_entries WHERE ip = ?", [ip]);
    expect(Number(cnt)).toBe(1);

    await deleteTestManager(firstRow.id);
    managerId = secondRow.id;
    ipEntryId = secondRow.ipEntryId;
  });

  it("heartbeatManager persists netdeskAgentServiceStatus/netdeskAgentStartMode and bumps lastHeartbeatAt", async () => {
    const enrolled = await enrollManager({ hostname: testHostname(), managerVersion: "1.0.0", ip: testIp() });
    const [[row]] = await pool.query("SELECT id, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?", [
      enrolled.managerId,
    ]);
    managerId = row.id;
    ipEntryId = row.ipEntryId;

    const before = await findManagerById(managerId);
    expect(before.lastHeartbeatAt).toBeNull();

    await heartbeatManager(
      managerId,
      { netdeskAgentServiceStatus: "Stopped", netdeskAgentStartMode: "Disabled" },
      "10.230.62.81",
    );

    const after = await findManagerById(managerId);
    expect(after.lastHeartbeatAt).toBeTruthy();
    expect(after.netdeskAgentServiceStatus).toBe("Stopped");
    expect(after.netdeskAgentStartMode).toBe("Disabled");
    expect(after.lastIp).toBe("10.230.62.81");
  });

  it("heartbeatManager throws 404 for an unknown managerId", async () => {
    await expect(heartbeatManager(999999999, {}, "10.230.62.81")).rejects.toMatchObject({ status: 404 });
  });

  it("getManagerByIpEntryId returns null when no manager has ever enrolled for that ip_entry_id", async () => {
    expect(await getManagerByIpEntryId(999999999)).toBeNull();
  });

  it("getManagerByIpEntryId returns the manager's live status once enrolled", async () => {
    const enrolled = await enrollManager({ hostname: testHostname(), managerVersion: "1.2.3", ip: testIp() });
    const [[row]] = await pool.query("SELECT id, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?", [
      enrolled.managerId,
    ]);
    managerId = row.id;
    ipEntryId = row.ipEntryId;

    const status = await getManagerByIpEntryId(ipEntryId);
    expect(status.managerId).toBe(managerId);
    expect(status.managerVersion).toBe("1.2.3");
    expect(status.connectivityStatus).toBe("unknown");
  });
});
