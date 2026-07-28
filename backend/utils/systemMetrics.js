import si from "systeminformation";

// systeminformation's currentLoad() samples CPU usage over an interval
// internally (not instant) - caching the result for a few seconds avoids
// hammering it on every dashboard poll/request-metrics read.
const CACHE_MS = 4000;
let cached = null;
let lastFetchAt = 0;

export async function getSystemSnapshot() {
  const now = Date.now();
  if (cached && now - lastFetchAt < CACHE_MS) return cached;

  const [cpu, mem, disks] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
  ]);

  // Primary/largest volume - "disk usage" as a single number is meant to be
  // a quick health indicator, not a full per-volume breakdown.
  const mainDisk = disks.reduce(
    (largest, d) => (!largest || d.size > largest.size ? d : largest),
    null,
  );

  cached = {
    cpuLoadPct: round1(cpu.currentLoad),
    ramUsedMb: Math.round(mem.active / 1024 / 1024),
    ramTotalMb: Math.round(mem.total / 1024 / 1024),
    ramUsedPct: round1((mem.active / mem.total) * 100),
    diskUsedPct: mainDisk ? round1(mainDisk.use) : null,
  };
  lastFetchAt = now;
  return cached;
}

// Same caching reasoning as getSystemSnapshot - si.processes() scans every
// running process, not free to call on every poll.
let mariaDbCached = null;
let mariaDbFetchAt = 0;

export async function getMariaDbProcessSnapshot() {
  const now = Date.now();
  if (mariaDbCached !== null && now - mariaDbFetchAt < CACHE_MS) return mariaDbCached;

  const { list } = await si.processes();
  // MariaDB's Windows service binary is mysqld.exe (MySQL-compatible
  // naming); Linux packages sometimes ship mariadbd instead - matching
  // both covers either deployment target.
  const proc = list.find((p) => /mysqld|mariadbd/i.test(p.name));

  mariaDbCached = proc
    ? {
        found: true,
        cpuPct: round1(proc.cpu),
        memMb: Math.round((proc.memRss || 0) / 1024),
      }
    : { found: false, cpuPct: null, memMb: null };

  mariaDbFetchAt = now;
  return mariaDbCached;
}

export function getProcessSnapshot() {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    uptimeSeconds: Math.round(process.uptime()),
  };
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}
