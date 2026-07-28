import { getSystemSnapshot, getProcessSnapshot, getMariaDbProcessSnapshot } from "../utils/systemMetrics.js";
import { getLiveRequestStats } from "../utils/requestMetrics.js";
import { getLiveQueryStats } from "../utils/dbQueryMetrics.js";
import {
  getDbSnapshot,
  getDbSizeSnapshot,
  insertServerSnapshot,
  listServerHistory,
} from "../repositories/serverMonitoring.repo.js";

export async function getLiveServerHealthService() {
  const [system, db, dbSize, mariaDbProcess] = await Promise.all([
    getSystemSnapshot(),
    getDbSnapshot(),
    getDbSizeSnapshot(),
    getMariaDbProcessSnapshot(),
  ]);

  return {
    system,
    db: { ...db, ...getLiveQueryStats(), size: dbSize, process: mariaDbProcess },
    process: getProcessSnapshot(),
    requests: getLiveRequestStats(),
  };
}

// Called on an interval from server.js (same pattern as startPingLoop) to
// persist a point-in-time snapshot for the historical trend charts - the
// live view above reads fresh/in-memory data and is never itself persisted.
export async function captureServerSnapshot() {
  const live = await getLiveServerHealthService();

  await insertServerSnapshot({
    cpuLoadPct: live.system.cpuLoadPct,
    ramUsedPct: live.system.ramUsedPct,
    ramUsedMb: live.system.ramUsedMb,
    ramTotalMb: live.system.ramTotalMb,
    diskUsedPct: live.system.diskUsedPct,
    processRssMb: live.process.rssMb,
    processHeapUsedMb: live.process.heapUsedMb,
    dbThreadsConnected: live.db.threadsConnected,
    requestsPerMin: live.requests.requestsPerMin,
    avgResponseMs: live.requests.avgResponseMs,
    errorRatePct: live.requests.errorRatePct,
    dbSizeMb: live.db.size.totalSizeMb,
    avgQueryMs: live.db.avgQueryMs,
    p95ResponseMs: live.requests.p95ResponseMs,
    p99ResponseMs: live.requests.p99ResponseMs,
    mariadbCpuPct: live.db.process.cpuPct,
    mariadbMemMb: live.db.process.memMb,
  });
}

export async function listServerHealthHistoryService(hours) {
  const items = await listServerHistory(hours);
  return { items };
}
