import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createManagerJobService,
  pollJobsService,
  submitJobResultService,
  listJobsForManagerService,
  cancelJobService,
} from "../../services/managerJobs.service.js";
import { enrollManager } from "../../services/managers.service.js";
import { revokeManagerById } from "../../repositories/managers.repo.js";
import { pool } from "../../db/pool.js";
import { testIp, testHostname, deleteTestIpEntry } from "../helpers/testDb.js";

async function deleteTestManager(id) {
  if (!id) return;
  await pool.execute("DELETE FROM managers WHERE id = ?", [id]);
}

describe("managerJobs.service (integration, real DB)", () => {
  let managerId;
  let ipEntryId;

  beforeEach(async () => {
    const enrolled = await enrollManager({ hostname: testHostname(), managerVersion: "1.0.0", ip: testIp() });
    const [[row]] = await pool.query("SELECT id, ip_entry_id AS ipEntryId FROM managers WHERE manager_uid = ?", [
      enrolled.managerId,
    ]);
    managerId = row.id;
    ipEntryId = row.ipEntryId;
  });

  afterEach(async () => {
    await deleteTestManager(managerId);
    await deleteTestIpEntry(ipEntryId);
  });

  it("defaults payload.serviceName to NetdeskAgent for a service-control command with no payload", async () => {
    const job = await createManagerJobService(managerId, { commandType: "start_service" }, null);
    expect(job.payload).toEqual({ serviceName: "NetdeskAgent" });
  });

  it("keeps an explicit serviceName instead of overriding it", async () => {
    const job = await createManagerJobService(
      managerId,
      { commandType: "stop_service", payload: { serviceName: "Spooler" } },
      null,
    );
    expect(job.payload).toEqual({ serviceName: "Spooler" });
  });

  it("refuses install_update for an unknown releaseId", async () => {
    await expect(
      createManagerJobService(managerId, { commandType: "install_update", payload: { releaseId: 999999999 } }, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses to create a job for a manager that doesn't exist", async () => {
    await expect(
      createManagerJobService(999999999, { commandType: "start_service" }, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to create a job for a revoked manager", async () => {
    await revokeManagerById(managerId);
    await expect(
      createManagerJobService(managerId, { commandType: "start_service" }, null),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("round-trips pending -> sent -> completed, and rejects a second result submission (409)", async () => {
    const job = await createManagerJobService(managerId, { commandType: "restart_service" }, null);

    const firstPoll = await pollJobsService(managerId);
    expect(firstPoll).toHaveLength(1);
    expect(firstPoll[0].status).toBe("sent");

    const secondPoll = await pollJobsService(managerId);
    expect(secondPoll).toHaveLength(0);

    await expect(
      submitJobResultService(managerId, job.id, { success: true, exitCode: 0 }),
    ).resolves.toMatchObject({ status: "completed" });

    await expect(
      submitJobResultService(managerId, job.id, { success: true, exitCode: 0 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a result before the job has been polled (still 'pending', not 'sent')", async () => {
    const job = await createManagerJobService(managerId, { commandType: "start_service" }, null);
    await expect(
      submitJobResultService(managerId, job.id, { success: true }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("marks a job failed when success:false is reported", async () => {
    const job = await createManagerJobService(managerId, { commandType: "start_service" }, null);
    await pollJobsService(managerId);
    const result = await submitJobResultService(managerId, job.id, { success: false, errorOutput: "boom" });
    expect(result.status).toBe("failed");
  });

  it("cancelJobService cancels a pending job", async () => {
    const job = await createManagerJobService(managerId, { commandType: "start_service" }, null);
    const cancelled = await cancelJobService(job.id);
    expect(cancelled.status).toBe("cancelled");
  });

  it("cancelJobService throws 409 for an already-completed job", async () => {
    const job = await createManagerJobService(managerId, { commandType: "start_service" }, null);
    await pollJobsService(managerId);
    await submitJobResultService(managerId, job.id, { success: true, exitCode: 0 });
    await expect(cancelJobService(job.id)).rejects.toMatchObject({ status: 409 });
  });

  it("listJobsForManagerService paginates and filters by status", async () => {
    await createManagerJobService(managerId, { commandType: "start_service" }, null);
    await createManagerJobService(managerId, { commandType: "stop_service" }, null);

    const all = await listJobsForManagerService(managerId, { page: 1, limit: 20, status: "all" });
    expect(all.total).toBe(2);

    const pending = await listJobsForManagerService(managerId, { page: 1, limit: 20, status: "pending" });
    expect(pending.total).toBe(2);

    await pollJobsService(managerId);
    const sent = await listJobsForManagerService(managerId, { page: 1, limit: 20, status: "sent" });
    expect(sent.total).toBe(2);
  });
});
