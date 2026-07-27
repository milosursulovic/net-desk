import { getSystemSnapshot, getProcessSnapshot } from "../utils/systemMetrics.js";
import { getLiveRequestStats } from "../utils/requestMetrics.js";
import {
  getDbSnapshot,
  insertServerSnapshot,
  listServerHistory,
} from "../repositories/serverMonitoring.repo.js";

export async function getLiveServerHealthService() {
  const [system, db] = await Promise.all([getSystemSnapshot(), getDbSnapshot()]);

  return {
    system,
    db,
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
  });
}

export async function listServerHealthHistoryService(hours) {
  const items = await listServerHistory(hours);
  return { items };
}
