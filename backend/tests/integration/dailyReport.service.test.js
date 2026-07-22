import { describe, it, expect, afterEach } from "vitest";
import {
  generateDailyReport,
  getLatestReportService,
  getReportByIdService,
  listReportsService,
  markReportReadService,
} from "../../services/dailyReport.service.js";
import { enrollAgent, heartbeat } from "../../services/agents.service.js";
import { pool } from "../../db/pool.js";
import {
  deleteTestDailyReport,
  deleteTestAgent,
  testHostname,
} from "../helpers/testDb.js";

describe("dailyReport.service (integration, real DB)", () => {
  let reportId;

  afterEach(async () => {
    await deleteTestDailyReport(reportId);
    reportId = undefined;
  });

  it("generateDailyReport produces a report with the expected shape and a valid time window", async () => {
    const report = await generateDailyReport();
    reportId = report.id;

    expect(report.id).toBeTruthy();
    expect(new Date(report.periodEnd).getTime()).toBeGreaterThan(
      new Date(report.periodStart).getTime(),
    );

    expect(report.content).toHaveProperty("fleet");
    expect(report.content).toHaveProperty("alerts");
    expect(report.content).toHaveProperty("sinceLastReport");
    expect(Array.isArray(report.content.alerts)).toBe(true);
    expect(typeof report.content.fleet.totalAgents).toBe("number");
    expect(typeof report.content.sinceLastReport.newAgentsCount).toBe("number");
    expect(Array.isArray(report.content.sinceLastReport.newAgents)).toBe(true);
  });

  it("getLatestReportService returns the most recently generated report", async () => {
    const generated = await generateDailyReport();
    reportId = generated.id;

    const latest = await getLatestReportService();
    expect(latest.id).toBe(generated.id);
  });

  it("getReportByIdService returns the report by id and rejects an unknown id with 404", async () => {
    const generated = await generateDailyReport();
    reportId = generated.id;

    const found = await getReportByIdService(generated.id);
    expect(found.id).toBe(generated.id);
    expect(found.content).toHaveProperty("fleet");

    await expect(getReportByIdService(999999999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("listReportsService returns a paginated list that includes a freshly generated report", async () => {
    const generated = await generateDailyReport();
    reportId = generated.id;

    const out = await listReportsService({ page: 1, limit: 50 });
    expect(out).toHaveProperty("items");
    expect(out).toHaveProperty("total");
    expect(out.items.map((r) => r.id)).toContain(generated.id);
  });

  it("a second report's period starts where the previous one's ended", async () => {
    const first = await generateDailyReport();
    const second = await generateDailyReport();
    reportId = second.id; // clean up second explicitly below, first via afterEach ordering

    expect(new Date(second.periodStart).getTime()).toBe(
      new Date(first.periodEnd).getTime(),
    );

    await deleteTestDailyReport(first.id);
  });

  it("markReportReadService sets openedAt only on the first call (idempotent)", async () => {
    const generated = await generateDailyReport();
    reportId = generated.id;
    expect(generated.openedAt).toBeNull();

    const firstMark = await markReportReadService(generated.id);
    expect(firstMark.openedAt).not.toBeNull();

    const secondMark = await markReportReadService(generated.id);
    expect(new Date(secondMark.openedAt).getTime()).toBe(
      new Date(firstMark.openedAt).getTime(),
    );

    await expect(markReportReadService(999999999)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("generateDailyReport snapshots current agent_monitoring into agent_monitoring_history", async () => {
    const enrolled = await enrollAgent({ hostname: testHostname() });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    const agentId = found.id;

    try {
      await heartbeat(
        agentId,
        {
          monitoring: {
            cpuLoadPct: 12.5,
            ramLoadPct: 60.1,
            diskUsedPct: 45.2,
            diskFreeGb: 100.7,
          },
        },
        "10.230.62.81",
      );

      const generated = await generateDailyReport();
      reportId = generated.id;

      const [rows] = await pool.query(
        "SELECT * FROM agent_monitoring_history WHERE agent_id = ?",
        [agentId],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].cpu_load_pct)).toBeCloseTo(12.5);
      expect(Number(rows[0].ram_load_pct)).toBeCloseTo(60.1);
      expect(Number(rows[0].disk_used_pct)).toBeCloseTo(45.2);
      expect(Number(rows[0].disk_free_gb)).toBeCloseTo(100.7);
      expect(new Date(rows[0].recorded_at).getTime()).toBe(
        new Date(generated.periodEnd).getTime(),
      );
    } finally {
      // agent_monitoring and agent_monitoring_history both cascade-delete
      // via their FK to agents, so removing the agent is enough cleanup.
      await deleteTestAgent(agentId);
    }
  });

  it(
    "generateDailyReport surfaces a disk-fill projection when an agent's " +
      "backdated history shows a clear rising trend (full pipeline, not just " +
      "the pure computeDiskFillProjection unit test)",
    async () => {
      const hostname = testHostname();
      const enrolled = await enrollAgent({ hostname });
      const { findAgentByUid } = await import("../../repositories/agents.repo.js");
      const found = await findAgentByUid(enrolled.agentId);
      const agentId = found.id;

      try {
        // Backdated points at +5%/day, ending well below the 90% threshold -
        // generateDailyReport() will add today's real snapshot on top of
        // these when it runs.
        const daysAgo = (n) => new Date(Date.now() - n * 86400000);
        await pool.query(
          `
          INSERT INTO agent_monitoring_history
          (agent_id, disk_used_pct, recorded_at)
          VALUES ?
          `,
          [
            [
              [agentId, 40, daysAgo(4)],
              [agentId, 45, daysAgo(3)],
              [agentId, 50, daysAgo(2)],
              [agentId, 55, daysAgo(1)],
            ],
          ],
        );
        // Give the agent a current disk_used_pct so today's snapshot (taken
        // inside generateDailyReport) continues the same rising trend.
        await heartbeat(agentId, { monitoring: { diskUsedPct: 60 } }, "10.230.62.81");

        const generated = await generateDailyReport();
        reportId = generated.id;

        const projections = generated.content.trends.diskFillProjections;
        const forThisAgent = projections.find((p) => p.hostname === hostname);
        expect(forThisAgent).toBeTruthy();
        expect(forThisAgent.daysUntilThreshold).toBeGreaterThan(0);
        expect(forThisAgent.slopePctPerDay).toBeGreaterThan(0);
      } finally {
        await deleteTestAgent(agentId);
      }
    },
  );

  it("generateDailyReport surfaces CPU/RAM trend projections the same way as disk", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    const agentId = found.id;

    try {
      const daysAgo = (n) => new Date(Date.now() - n * 86400000);
      await pool.query(
        `
        INSERT INTO agent_monitoring_history
        (agent_id, cpu_load_pct, ram_load_pct, recorded_at)
        VALUES ?
        `,
        [
          [
            [agentId, 40, 40, daysAgo(4)],
            [agentId, 45, 45, daysAgo(3)],
            [agentId, 50, 50, daysAgo(2)],
            [agentId, 55, 55, daysAgo(1)],
          ],
        ],
      );
      await heartbeat(
        agentId,
        { monitoring: { cpuLoadPct: 60, ramLoadPct: 60 } },
        "10.230.62.81",
      );

      const generated = await generateDailyReport();
      reportId = generated.id;

      const cpuForAgent = generated.content.trends.cpuLoadProjections.find(
        (p) => p.hostname === hostname,
      );
      const ramForAgent = generated.content.trends.ramLoadProjections.find(
        (p) => p.hostname === hostname,
      );
      expect(cpuForAgent).toBeTruthy();
      expect(ramForAgent).toBeTruthy();
      expect(cpuForAgent.slopePctPerDay).toBeGreaterThan(0);
      expect(ramForAgent.slopePctPerDay).toBeGreaterThan(0);
    } finally {
      await deleteTestAgent(agentId);
    }
  });

  it("generateDailyReport surfaces an anomaly when today's value spikes far outside an agent's historical baseline", async () => {
    const hostname = testHostname();
    const enrolled = await enrollAgent({ hostname });
    const { findAgentByUid } = await import("../../repositories/agents.repo.js");
    const found = await findAgentByUid(enrolled.agentId);
    const agentId = found.id;

    try {
      const daysAgo = (n) => new Date(Date.now() - n * 86400000);
      await pool.query(
        `
        INSERT INTO agent_monitoring_history
        (agent_id, ram_load_pct, recorded_at)
        VALUES ?
        `,
        [
          [
            [agentId, 30, daysAgo(7)],
            [agentId, 31, daysAgo(6)],
            [agentId, 29, daysAgo(5)],
            [agentId, 30, daysAgo(4)],
            [agentId, 31, daysAgo(3)],
            [agentId, 29, daysAgo(2)],
            [agentId, 30, daysAgo(1)],
          ],
        ],
      );
      // Today's real snapshot (taken inside generateDailyReport) is the spike.
      await heartbeat(agentId, { monitoring: { ramLoadPct: 95 } }, "10.230.62.81");

      const generated = await generateDailyReport();
      reportId = generated.id;

      const anomaly = generated.content.trends.anomalies.find(
        (a) => a.hostname === hostname && a.metric === "ram",
      );
      expect(anomaly).toBeTruthy();
      expect(anomaly.currentValue).toBe(95);
      expect(Math.abs(anomaly.zScore)).toBeGreaterThan(3);
    } finally {
      await deleteTestAgent(agentId);
    }
  });
});
