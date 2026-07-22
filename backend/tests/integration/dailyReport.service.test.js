import { describe, it, expect, afterEach } from "vitest";
import {
  generateDailyReport,
  getLatestReportService,
  getReportByIdService,
  listReportsService,
  markReportReadService,
} from "../../services/dailyReport.service.js";
import { deleteTestDailyReport } from "../helpers/testDb.js";

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
});
