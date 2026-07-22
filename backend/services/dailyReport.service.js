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
import { listNotifications } from "./notifications.service.js";
import { sendPushToAll } from "../utils/webPush.js";
import { paginate } from "../utils/pagination.js";
import { notFound } from "../utils/httpError.js";

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
