import {
  insertDailyReport,
  findLatestDailyReport,
  findDailyReportById,
  listDailyReports,
  markDailyReportOpened,
} from "../repositories/dailyReports.repo.js";
import {
  countAgentsByConnectivity,
  listAgentsEnrolledSince,
  countAgentsEnrolledSince,
} from "../repositories/agents.repo.js";
import {
  countIpEntriesTotal,
  listIpEntriesCreatedSince,
  countIpEntriesCreatedSince,
} from "../repositories/ipEntries.repo.js";
import { countOfflineEntries } from "../repositories/notifications.repo.js";
import {
  listPrintersCreatedSince,
  countPrintersCreatedSince,
} from "../repositories/printers.repo.js";
import {
  listFailedJobsSince,
  countFailedJobsSince,
} from "../repositories/agentJobs.repo.js";
import {
  listFailedUpdatesSince,
  countFailedUpdatesSince,
} from "../repositories/agentUpdateLog.repo.js";
import { countStatusTransitionsSince } from "../repositories/ipStatusHistory.repo.js";
import {
  listCurrentMonitoringForAllAgents,
  insertMonitoringSnapshot,
  listMonitoringHistorySince,
} from "../repositories/agentMonitoringHistory.repo.js";
import { listNotifications } from "./notifications.service.js";
import { sendPushToAll } from "../utils/webPush.js";
import { paginate } from "../utils/pagination.js";
import { notFound } from "../utils/httpError.js";
import {
  computeDiskFillProjection,
  computeCpuLoadProjection,
  computeRamLoadProjection,
  computeDiskAnomaly,
  computeCpuAnomaly,
  computeRamAnomaly,
} from "../utils/trendAnalysis.js";

// 90 days (not 30) - anomaly detection's baseline (mean/stddev) needs a
// richer window than a threshold projection's slope does, and there's no
// downside to keeping more history around now while data is still sparse.
const TREND_WINDOW_DAYS = 90;

export async function generateDailyReport() {
  const periodEnd = new Date();
  const previous = await findLatestDailyReport();
  const periodStart = previous ? new Date(previous.periodEnd) : new Date(periodEnd - 24 * 60 * 60 * 1000);

  const [
    connectivity,
    totalIpEntries,
    offlineIpEntries,
    newAgents,
    newAgentsCount,
    newIpEntries,
    newIpEntriesCount,
    newPrinters,
    newPrintersCount,
    failedJobs,
    failedJobsCount,
    failedUpdates,
    failedUpdatesCount,
    statusTransitions,
    alerts,
  ] = await Promise.all([
    countAgentsByConnectivity(),
    countIpEntriesTotal(),
    countOfflineEntries(),
    listAgentsEnrolledSince(periodStart),
    countAgentsEnrolledSince(periodStart),
    listIpEntriesCreatedSince(periodStart),
    countIpEntriesCreatedSince(periodStart),
    listPrintersCreatedSince(periodStart),
    countPrintersCreatedSince(periodStart),
    listFailedJobsSince(periodStart),
    countFailedJobsSince(periodStart),
    listFailedUpdatesSince(periodStart),
    countFailedUpdatesSince(periodStart),
    countStatusTransitionsSince(periodStart),
    listNotifications(),
  ]);

  // Snapshot everyone's current CPU/RAM/disk into history, tied to report
  // generation (not every heartbeat - agent_monitoring already updates every
  // ~30s, and that cadence forever would explode this table for no benefit).
  const currentMonitoring = await listCurrentMonitoringForAllAgents();
  await insertMonitoringSnapshot(
    currentMonitoring.map((m) => ({ ...m, recordedAt: periodEnd })),
  );

  // Disk-fill trend, computed from the history just extended above (so
  // today's fresh point is included) - most days this will be empty/near-
  // empty since real trends take a while to accumulate; that's expected,
  // not a bug, and computeDiskFillProjection returns null rather than a
  // noisy row for agents with too little history or a flat/decreasing trend.
  const windowStart = new Date(periodEnd - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const historyRows = await listMonitoringHistorySince(windowStart);
  const historyByAgent = new Map();
  for (const row of historyRows) {
    if (!historyByAgent.has(row.agentId)) historyByAgent.set(row.agentId, []);
    historyByAgent.get(row.agentId).push(row);
  }
  const diskFillProjections = [];
  const cpuLoadProjections = [];
  const ramLoadProjections = [];
  const anomalies = [];
  for (const rows of historyByAgent.values()) {
    const hostname = rows[0].hostname;

    const diskProjection = computeDiskFillProjection(rows);
    if (diskProjection) diskFillProjections.push({ hostname, ...diskProjection });

    const cpuProjection = computeCpuLoadProjection(rows);
    if (cpuProjection) cpuLoadProjections.push({ hostname, ...cpuProjection });

    const ramProjection = computeRamLoadProjection(rows);
    if (ramProjection) ramLoadProjections.push({ hostname, ...ramProjection });

    const diskAnomaly = computeDiskAnomaly(rows);
    if (diskAnomaly) anomalies.push({ hostname, metric: "disk", ...diskAnomaly });

    const cpuAnomaly = computeCpuAnomaly(rows);
    if (cpuAnomaly) anomalies.push({ hostname, metric: "cpu", ...cpuAnomaly });

    const ramAnomaly = computeRamAnomaly(rows);
    if (ramAnomaly) anomalies.push({ hostname, metric: "ram", ...ramAnomaly });
  }
  diskFillProjections.sort((a, b) => a.daysUntilThreshold - b.daysUntilThreshold);
  cpuLoadProjections.sort((a, b) => a.daysUntilThreshold - b.daysUntilThreshold);
  ramLoadProjections.sort((a, b) => a.daysUntilThreshold - b.daysUntilThreshold);
  anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

  const totalAgents =
    connectivity.online + connectivity.stale + connectivity.offline + connectivity.unknown;

  const content = {
    fleet: {
      totalAgents,
      onlineAgents: connectivity.online,
      staleAgents: connectivity.stale,
      offlineAgents: connectivity.offline,
      unknownAgents: connectivity.unknown,
      totalIpEntries,
      offlineIpEntries,
    },
    alerts: alerts.notifications,
    trends: {
      diskFillProjections,
      cpuLoadProjections,
      ramLoadProjections,
      anomalies,
    },
    sinceLastReport: {
      newAgents,
      newAgentsCount,
      newIpEntries,
      newIpEntriesCount,
      newPrinters,
      newPrintersCount,
      failedJobs,
      failedJobsCount,
      failedUpdates,
      failedUpdatesCount,
      statusTransitions,
    },
  };

  const id = await insertDailyReport({
    periodStart,
    periodEnd,
    content,
  });

  await sendPushToAll({
    title: "Dnevni izveštaj je spreman",
    body: buildPushSummary(content),
    url: `/reports/${id}`,
  });

  return await findDailyReportById(id);
}

function buildPushSummary(content) {
  const parts = [];
  if (content.sinceLastReport.newAgentsCount) {
    parts.push(`${content.sinceLastReport.newAgentsCount} novih agenata`);
  }
  if (content.sinceLastReport.failedJobsCount) {
    parts.push(`${content.sinceLastReport.failedJobsCount} neuspešnih komandi`);
  }
  if (content.alerts.length) {
    parts.push(`${content.alerts.length} aktivnih upozorenja`);
  }
  if (content.trends.diskFillProjections.length) {
    const soonest = content.trends.diskFillProjections[0];
    parts.push(
      `disk na ${soonest.hostname} stiže do 90% za ~${soonest.daysUntilThreshold} dana`,
    );
  }
  if (content.trends.anomalies.length) {
    parts.push(`${content.trends.anomalies.length} anomalija u ponašanju agenata`);
  }
  if (!parts.length) {
    return "Sve mirno od poslednjeg izveštaja.";
  }
  return parts.join(", ") + ".";
}

export async function getLatestReportService() {
  const report = await findLatestDailyReport();
  if (!report) {
    throw notFound("Još nema generisanih izveštaja");
  }
  return report;
}

export async function getReportByIdService(id) {
  const report = await findDailyReportById(id);
  if (!report) {
    throw notFound("Izveštaj nije pronađen");
  }
  return report;
}

// Deliberately a separate action from getReportByIdService/getLatestReportService
// (both plain GETs) rather than auto-marking on fetch - a nav badge or any
// other caller needs to be able to check read status without side effects
// (mirrors GET /api/agents/ping being side-effect-free unlike heartbeat).
// The frontend calls this explicitly once it actually renders the report.
export async function markReportReadService(id) {
  const report = await findDailyReportById(id);
  if (!report) {
    throw notFound("Izveštaj nije pronađen");
  }
  await markDailyReportOpened(id);
  return await findDailyReportById(id);
}

export async function listReportsService({ page, limit }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listDailyReports({ limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });
  return { items, page: safePage, limit, total, totalPages };
}
