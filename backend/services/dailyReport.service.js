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
import {
  countOfflineEntries,
  listBlacklistedDomainHits,
} from "../repositories/notifications.repo.js";
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
import { SITES } from "../dtos/ipAddresses.dto.js";
import { computeDiskFillProjection } from "../utils/trendAnalysis.js";

// Disk-fill projection's slope only needs enough points for a reasonable
// linear regression, not a long baseline - 30 days is plenty (anomaly
// detection used to need a richer 90-day window for its mean/stddev
// baseline, but that feature was removed as unhelpful noise).
const TREND_WINDOW_DAYS = 30;

// Isti prozor kao countBlacklistedDomainHits(24, site) u notifications.
// service.js - izveštaj prikazuje ISTIH 24h koje već pokreću upozorenje,
// samo sa detaljima (koji računar/domen), ne fiksno vezano za periodStart
// (koji može biti duži/kraći od 24h u zavisnosti kad je prošli izveštaj
// generisan).
const BLACKLISTED_DOMAIN_WINDOW_HOURS = 24;

// Postojeći redovi u daily_reports pre uvođenja lokacija su svi stvarno iz
// bolnice (potvrđeno uživo pri planiranju multi-site feature-a) - isti
// default kao SQL migracija (daily_reports.site DEFAULT 'bolnica').
const DEFAULT_SITE = "bolnica";
const SITE_LABELS = { bolnica: "Bolnica", dom_zdravlja: "Dom zdravlja" };

// Snimak trenutnog CPU/RAM/disk stanja SVIH agenata u istoriju, vezan za
// generisanje izveštaja (ne svaki heartbeat - agent_monitoring se već
// ažurira na ~30s, i ta učestalost zauvek bi eksplodirala ovu tabelu bez
// koristi). Namerno odvojeno od generateDailyReport(site) i pozvano SAMO
// JEDNOM po ciklusu generisanja (ne po lokaciji) - ovo je snimak cele
// flote, ne po-lokaciji upit, pa bi pozivanje dva puta (jednom po lokaciji)
// upisalo duplirane redove istorije za svakog agenta.
async function snapshotCurrentMonitoring(periodEnd) {
  const currentMonitoring = await listCurrentMonitoringForAllAgents();
  await insertMonitoringSnapshot(
    currentMonitoring.map((m) => ({ ...m, recordedAt: periodEnd })),
  );
}

export async function generateDailyReport(
  site,
  { skipSnapshot = false, periodEnd = new Date() } = {},
) {
  const previous = await findLatestDailyReport(site);
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
    blacklistedDomainHits,
  ] = await Promise.all([
    countAgentsByConnectivity(site),
    countIpEntriesTotal(site),
    countOfflineEntries(site),
    listAgentsEnrolledSince(periodStart, 20, site),
    countAgentsEnrolledSince(periodStart, site),
    listIpEntriesCreatedSince(periodStart, 20, site),
    countIpEntriesCreatedSince(periodStart, site),
    listPrintersCreatedSince(periodStart, 20, site),
    countPrintersCreatedSince(periodStart, site),
    listFailedJobsSince(periodStart, 20, site),
    countFailedJobsSince(periodStart, site),
    listFailedUpdatesSince(periodStart, 20, site),
    countFailedUpdatesSince(periodStart, site),
    countStatusTransitionsSince(periodStart, site),
    listNotifications(site),
    listBlacklistedDomainHits(BLACKLISTED_DOMAIN_WINDOW_HOURS, site),
  ]);

  if (!skipSnapshot) {
    await snapshotCurrentMonitoring(periodEnd);
  }

  // Disk-fill trend, computed from the history just extended above (so
  // today's fresh point is included) - most days this will be empty/near-
  // empty since real trends take a while to accumulate; that's expected,
  // not a bug, and computeDiskFillProjection returns null rather than a
  // noisy row for agents with too little history or a flat/decreasing trend.
  const windowStart = new Date(periodEnd - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const historyRows = await listMonitoringHistorySince(windowStart, site);
  const historyByAgent = new Map();
  for (const row of historyRows) {
    if (!historyByAgent.has(row.agentId)) historyByAgent.set(row.agentId, []);
    historyByAgent.get(row.agentId).push(row);
  }
  const diskFillProjections = [];
  for (const rows of historyByAgent.values()) {
    const hostname = rows[0].hostname;

    const diskProjection = computeDiskFillProjection(rows);
    if (diskProjection) diskFillProjections.push({ hostname, ...diskProjection });
  }
  diskFillProjections.sort((a, b) => a.daysUntilThreshold - b.daysUntilThreshold);

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
    },
    blacklistedDomainHits,
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
    site: site ?? DEFAULT_SITE,
  });

  await sendPushToAll({
    title: site
      ? `Dnevni izveštaj je spreman (${SITE_LABELS[site] ?? site})`
      : "Dnevni izveštaj je spreman",
    body: buildPushSummary(content),
    url: `/reports/${id}`,
  });

  return await findDailyReportById(id);
}

// Generiše po jedan izveštaj za SVAKU lokaciju u jednom ciklusu (isti cron
// raspored kao pre uvođenja lokacija) - snimak agent_monitoring istorije se
// radi TAČNO JEDNOM ovde (ne po lokaciji, vidi snapshotCurrentMonitoring),
// dok se agregacije za sadržaj izveštaja rade po lokaciji.
export async function generateDailyReportsForAllSites() {
  const periodEnd = new Date();
  await snapshotCurrentMonitoring(periodEnd);

  const reports = [];
  for (const site of SITES) {
    reports.push(
      await generateDailyReport(site, { skipSnapshot: true, periodEnd }),
    );
  }
  return reports;
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
  if (content.blacklistedDomainHits.length) {
    parts.push(`${content.blacklistedDomainHits.length} poseta domenima sa crne liste`);
  }
  if (!parts.length) {
    return "Sve mirno od poslednjeg izveštaja.";
  }
  return parts.join(", ") + ".";
}

export async function getLatestReportService(site) {
  const report = await findLatestDailyReport(site);
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

export async function listReportsService({ page, limit, site }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listDailyReports({ limit, offset, site });
  const { page: safePage, totalPages } = paginate({ page, limit, total });
  return { items, page: safePage, limit, total, totalPages };
}
