// In-memory, per-process request tracking for the live server-health
// dashboard. Deliberately not persisted per-request (would be a real write
// bottleneck) - raw recent events are kept in a short rolling window and
// aggregated on read; periodic DB snapshots (serverHealth.service.js) are
// what feed the historical trend charts.
const WINDOW_MS = 5 * 60 * 1000; // keep 5 minutes of raw events
let events = [];

export function recordRequest({ method, route, status, durationMs }) {
  events.push({ ts: Date.now(), method, route, status, durationMs });
  pruneOld();
}

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS;
  let i = 0;
  while (i < events.length && events[i].ts < cutoff) i++;
  if (i > 0) events = events.slice(i);
}

/**
 * Aggregates the last `windowMs` of requests (default 1 minute) into
 * summary stats + a per-route breakdown, sorted by request count.
 */
export function getLiveRequestStats(windowMs = 60_000) {
  pruneOld();
  const cutoff = Date.now() - windowMs;
  const recent = events.filter((e) => e.ts >= cutoff);

  const count = recent.length;
  const errors = recent.filter((e) => e.status >= 500).length;
  const totalMs = recent.reduce((sum, e) => sum + e.durationMs, 0);

  const perRoute = new Map();
  for (const e of recent) {
    const key = `${e.method} ${e.route}`;
    const agg = perRoute.get(key) || { route: key, count: 0, totalMs: 0, errors: 0 };
    agg.count += 1;
    agg.totalMs += e.durationMs;
    if (e.status >= 500) agg.errors += 1;
    perRoute.set(key, agg);
  }

  const topRoutes = [...perRoute.values()]
    .map((r) => ({
      route: r.route,
      count: r.count,
      avgMs: Math.round(r.totalMs / r.count),
      errors: r.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    requestsPerMin: Math.round((count / windowMs) * 60_000),
    avgResponseMs: count ? Math.round(totalMs / count) : 0,
    errorRatePct: count ? Math.round((errors / count) * 1000) / 10 : 0,
    topRoutes,
  };
}
