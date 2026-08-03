import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  uploadReleaseService,
  setReleaseActiveService,
  checkForUpdateService,
  downloadReleaseService,
  updateReleaseGroupsService,
} from "../../services/agentReleases.service.js";
import { pool } from "../../db/pool.js";

let groupCounter = 0;
function uniqueGroup() {
  groupCounter += 1;
  return `vt_${Date.now().toString(36)}_${groupCounter}`;
}

describe("agentReleases.service (integration, real DB + filesystem)", () => {
  const createdReleases = [];

  afterEach(async () => {
    while (createdReleases.length) {
      const release = createdReleases.pop();
      const filePath = path.join(process.cwd(), "uploads", "agent-releases", release.filePath);
      fs.rmSync(filePath, { force: true });
      await pool.execute("DELETE FROM agent_update_log WHERE from_version = ? OR to_version = ?", [
        release.version,
        release.version,
      ]);
      // agent_release_groups has ON DELETE CASCADE on release_id - deleting
      // the release row is enough cleanup for the group rows too.
      await pool.execute("DELETE FROM agent_releases WHERE id = ?", [release.id]);
    }
  });

  it("uploads a release targeting MULTIPLE groups at once: computes SHA-256, writes the file, stores all groups", async () => {
    const buffer = Buffer.from("fake release zip contents");
    const groupA = uniqueGroup();
    const groupB = uniqueGroup();

    const release = await uploadReleaseService(
      { buffer, originalName: "agent.zip", version: "9.9.1", deploymentGroups: [groupA, groupB] },
      null,
    );
    createdReleases.push(release);

    expect(release.version).toBe("9.9.1");
    expect(release.deploymentGroups.sort()).toEqual([groupA, groupB].sort());
    expect(release.isActive).toBe(1);
    expect(release.sha256).toMatch(/^[0-9a-f]{64}$/);

    const crypto = await import("crypto");
    const expectedHash = crypto.createHash("sha256").update(buffer).digest("hex");
    expect(release.sha256).toBe(expectedHash);

    const filePath = path.join(process.cwd(), "uploads", "agent-releases", release.filePath);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath).equals(buffer)).toBe(true);
  });

  it("rejects an upload with no file", async () => {
    await expect(
      uploadReleaseService(
        { buffer: null, originalName: "x.zip", version: "1.0.0", deploymentGroups: [uniqueGroup()] },
        null,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("checkForUpdateService reports no update when the agent is already on the newest version", async () => {
    const group = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "1.0.0", deploymentGroups: [group] },
      null,
    );
    createdReleases.push(release);

    const out = await checkForUpdateService({ deploymentGroup: group, agentVersion: "1.0.0" });
    expect(out.updateAvailable).toBe(false);
  });

  it("checkForUpdateService reports the newest active release across multiple uploads", async () => {
    const group = uniqueGroup();
    const r1 = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "1.0.0", deploymentGroups: [group] },
      null,
    );
    createdReleases.push(r1);
    const r2 = await uploadReleaseService(
      { buffer: Buffer.from("v2"), originalName: "a.zip", version: "1.2.0", deploymentGroups: [group] },
      null,
    );
    createdReleases.push(r2);
    const r3 = await uploadReleaseService(
      { buffer: Buffer.from("v3"), originalName: "a.zip", version: "1.1.0", deploymentGroups: [group] },
      null,
    );
    createdReleases.push(r3);

    const out = await checkForUpdateService({ deploymentGroup: group, agentVersion: "0.9.0" });
    expect(out.updateAvailable).toBe(true);
    expect(out.version).toBe("1.2.0");
  });

  it("checkForUpdateService ignores releases from a different deployment group", async () => {
    const groupA = uniqueGroup();
    const groupB = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "5.0.0", deploymentGroups: [groupA] },
      null,
    );
    createdReleases.push(release);

    const out = await checkForUpdateService({ deploymentGroup: groupB, agentVersion: "1.0.0" });
    expect(out.updateAvailable).toBe(false);
  });

  it("checkForUpdateService ignores a deactivated release", async () => {
    const group = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "2.0.0", deploymentGroups: [group] },
      null,
    );
    createdReleases.push(release);

    await setReleaseActiveService(release.id, false);

    const out = await checkForUpdateService({ deploymentGroup: group, agentVersion: "1.0.0" });
    expect(out.updateAvailable).toBe(false);
  });

  it("defaults an agent with no deploymentGroup to 'rest'", async () => {
    // agents.deployment_group defaults to 'rest' in the schema -
    // checkForUpdateService must fall back the same way when the agent
    // object's deploymentGroup is unset, or 'rest'-group releases would
    // never reach agents that haven't had a group explicitly assigned.
    // Uses an implausibly high version so this passes regardless of
    // whatever real 'rest'-group releases already exist in this DB.
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "999.0.0", deploymentGroups: ["rest"] },
      null,
    );
    createdReleases.push(release);

    const out = await checkForUpdateService({ deploymentGroup: undefined, agentVersion: "1.0.0" });
    expect(out.updateAvailable).toBe(true);
    expect(out.version).toBe("999.0.0");
  });

  it("downloadReleaseService rejects an agent whose group isn't among the release's target groups", async () => {
    const groupA = uniqueGroup();
    const groupB = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "3.0.0", deploymentGroups: [groupA] },
      null,
    );
    createdReleases.push(release);

    await expect(
      downloadReleaseService(release.id, { deploymentGroup: groupB }),
    ).rejects.toMatchObject({ status: 404 });

    // Sanity check: the SAME release is downloadable by an agent whose
    // group IS among the target groups.
    const ok = await downloadReleaseService(release.id, { deploymentGroup: groupA });
    expect(ok.fileName).toBe(release.fileName);
  });

  it("updateReleaseGroupsService widens rollout - a group added after upload becomes eligible without re-uploading", async () => {
    const groupA = uniqueGroup();
    const groupB = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "4.0.0", deploymentGroups: [groupA] },
      null,
    );
    createdReleases.push(release);

    // Before widening, groupB doesn't see the update.
    const before = await checkForUpdateService({ deploymentGroup: groupB, agentVersion: "1.0.0" });
    expect(before.updateAvailable).toBe(false);

    const widened = await updateReleaseGroupsService(release.id, [groupA, groupB]);
    expect(widened.deploymentGroups.sort()).toEqual([groupA, groupB].sort());

    // After widening, groupB now sees the SAME release (no re-upload happened).
    const after = await checkForUpdateService({ deploymentGroup: groupB, agentVersion: "1.0.0" });
    expect(after.updateAvailable).toBe(true);
    expect(after.version).toBe("4.0.0");
  });

  it("updateReleaseGroupsService can also narrow the target set", async () => {
    const groupA = uniqueGroup();
    const groupB = uniqueGroup();
    const release = await uploadReleaseService(
      { buffer: Buffer.from("v1"), originalName: "a.zip", version: "4.1.0", deploymentGroups: [groupA, groupB] },
      null,
    );
    createdReleases.push(release);

    await updateReleaseGroupsService(release.id, [groupA]);

    const stillTargeted = await checkForUpdateService({ deploymentGroup: groupA, agentVersion: "1.0.0" });
    expect(stillTargeted.updateAvailable).toBe(true);

    const noLongerTargeted = await checkForUpdateService({ deploymentGroup: groupB, agentVersion: "1.0.0" });
    expect(noLongerTargeted.updateAvailable).toBe(false);
  });

  it("updateReleaseGroupsService rejects an unknown release id", async () => {
    await expect(updateReleaseGroupsService(999999999, ["rest"])).rejects.toMatchObject({ status: 404 });
  });
});
