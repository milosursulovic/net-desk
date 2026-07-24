import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  createJobService,
  createBatchJobService,
  pollJobsService,
  submitJobResultService,
} from "../../services/agentJobs.service.js";
import { insertAgent, revokeAgentById } from "../../repositories/agents.repo.js";
import { deleteTestAgent, testHostname } from "../helpers/testDb.js";

describe("agentJobs.service (integration, real DB)", () => {
  let agentId;

  beforeEach(async () => {
    agentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: "test-hash",
      hostname: testHostname(),
      osCaption: "Windows 10 Pro",
      osVersion: "10.0.19045",
      osBuild: "19045",
      agentVersion: "1.0.0",
    });
  });

  afterEach(async () => {
    await deleteTestAgent(agentId);
  });

  it("round-trips a job payload as an object, not a JSON string (regression)", async () => {
    // Confirmed live: on an environment where agent_jobs.payload was a plain
    // LONGTEXT column (not MariaDB's real JSON pseudo-type), mysql2 returned
    // the raw JSON string instead of a parsed object, which crashed the C#
    // agent's Newtonsoft deserializer (JObject expected, got JValue). See
    // agentJobs.repo.js's parsePayload().
    await createJobService(
      agentId,
      { commandType: "restart_service", payload: { serviceName: "Spooler" } },
      null,
    );

    const jobs = await pollJobsService(agentId);
    expect(jobs).toHaveLength(1);
    expect(typeof jobs[0].payload).toBe("object");
    expect(jobs[0].payload).toEqual({ serviceName: "Spooler" });
  });

  it("round-trips an empty {} payload correctly (regression: frontend always sends {})", async () => {
    await createJobService(agentId, { commandType: "collect_inventory", payload: {} }, null);

    const jobs = await pollJobsService(agentId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toEqual({});
  });

  it("marks polled jobs as 'sent' so they aren't dispatched twice", async () => {
    await createJobService(agentId, { commandType: "delete_temp_files" }, null);

    const firstPoll = await pollJobsService(agentId);
    expect(firstPoll).toHaveLength(1);

    const secondPoll = await pollJobsService(agentId);
    expect(secondPoll).toHaveLength(0);
  });

  it("accepts a result only while the job is 'sent'", async () => {
    const job = await createJobService(agentId, { commandType: "delete_temp_files" }, null);

    // Not yet polled -> still 'pending', not 'sent' -> must be rejected.
    await expect(
      submitJobResultService(agentId, job.id, { success: true, exitCode: 0 }),
    ).rejects.toMatchObject({ status: 409 });

    await pollJobsService(agentId);

    const result = await submitJobResultService(agentId, job.id, {
      success: true,
      exitCode: 0,
      output: "done",
    });
    expect(result.status).toBe("completed");

    // Submitting a second time for the same job must also be rejected -
    // this is the duplicate-execution guard from the spec's security
    // requirements.
    await expect(
      submitJobResultService(agentId, job.id, { success: true, exitCode: 0 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("marks a job failed when the agent reports success:false", async () => {
    const job = await createJobService(agentId, { commandType: "delete_temp_files" }, null);
    await pollJobsService(agentId);

    const result = await submitJobResultService(agentId, job.id, {
      success: false,
      errorOutput: "boom",
    });
    expect(result.status).toBe("failed");
  });

  it("rejects submitting a result for a job belonging to a different agent (404, not 403 - avoids leaking existence)", async () => {
    const job = await createJobService(agentId, { commandType: "delete_temp_files" }, null);
    await pollJobsService(agentId);

    const otherAgentId = await insertAgent({
      agentUid: crypto.randomUUID(),
      apiKeyHash: "test-hash-2",
      hostname: testHostname("_other"),
      osCaption: null,
      osVersion: null,
      osBuild: null,
      agentVersion: null,
    });

    try {
      await expect(
        submitJobResultService(otherAgentId, job.id, { success: true }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      await deleteTestAgent(otherAgentId);
    }
  });

  it("refuses to create a job for an agent that doesn't exist", async () => {
    await expect(
      createJobService(999999999, { commandType: "delete_temp_files" }, null),
    ).rejects.toMatchObject({ status: 404 });
  });

  describe("createBatchJobService", () => {
    it("creates a job for each active agent in the list", async () => {
      const otherAgentId = await insertAgent({
        agentUid: crypto.randomUUID(),
        apiKeyHash: "test-hash-batch",
        hostname: testHostname("_batch"),
        osCaption: null,
        osVersion: null,
        osBuild: null,
        agentVersion: null,
      });

      try {
        const out = await createBatchJobService(
          [agentId, otherAgentId],
          { commandType: "delete_temp_files", payload: null },
          null,
        );
        expect(out.created).toHaveLength(2);
        expect(out.skipped).toHaveLength(0);

        const jobsForFirst = await pollJobsService(agentId);
        const jobsForSecond = await pollJobsService(otherAgentId);
        expect(jobsForFirst).toHaveLength(1);
        expect(jobsForSecond).toHaveLength(1);
      } finally {
        await deleteTestAgent(otherAgentId);
      }
    });

    it("skips a revoked (non-active) agent and a nonexistent one, reporting why", async () => {
      const revokedAgentId = await insertAgent({
        agentUid: crypto.randomUUID(),
        apiKeyHash: "test-hash-revoked",
        hostname: testHostname("_revoked"),
        osCaption: null,
        osVersion: null,
        osBuild: null,
        agentVersion: null,
      });
      await revokeAgentById(revokedAgentId);

      try {
        const out = await createBatchJobService(
          [agentId, revokedAgentId, 999999999],
          { commandType: "delete_temp_files", payload: null },
          null,
        );
        expect(out.created).toHaveLength(1);
        expect(out.created[0].agentId).toBe(agentId);
        expect(out.skipped).toHaveLength(2);
        expect(out.skipped.find((s) => s.agentId === revokedAgentId).reason).toMatch(/nije aktivan/);
        expect(out.skipped.find((s) => s.agentId === 999999999).reason).toMatch(/nije pronađen/);
      } finally {
        await deleteTestAgent(revokedAgentId);
      }
    });

    it("de-duplicates repeated agent ids instead of creating multiple jobs", async () => {
      const out = await createBatchJobService(
        [agentId, agentId, agentId],
        { commandType: "delete_temp_files", payload: null },
        null,
      );
      expect(out.created).toHaveLength(1);

      const jobs = await pollJobsService(agentId);
      expect(jobs).toHaveLength(1);
    });
  });
});
