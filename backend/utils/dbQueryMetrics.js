// Same in-memory rolling-window approach as requestMetrics.js, but for
// individual DB calls - wired up by wrapping pool.execute/pool.query once
// in db/pool.js so every existing call site gets timed transparently.
const WINDOW_MS = 5 * 60 * 1000;
const SLOW_MS = 200;
let events = [];

export function recordQuery(sql, durationMs) {
  events.push({ ts: Date.now(), sql: normalizeSql(sql), durationMs });
  pruneOld();
}

function pruneOld() {
  const cutoff = Date.now() - WINDOW_MS;
  let i = 0;
  while (i < events.length && events[i].ts < cutoff) i++;
  if (i > 0) events = events.slice(i);
}

// Queries are always parameterized (bound `?` params, never inlined
// values), so the raw SQL text itself never contains real data - safe to
// show as-is. Just collapse whitespace/truncate for a compact display.
function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

export function getLiveQueryStats(windowMs = 60_000) {
  pruneOld();
  const cutoff = Date.now() - windowMs;
  const recent = events.filter((e) => e.ts >= cutoff);

  const count = recent.length;
  const totalMs = recent.reduce((sum, e) => sum + e.durationMs, 0);
  const slowCount = recent.filter((e) => e.durationMs >= SLOW_MS).length;

  const slowestQueries = [...recent]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)
    .map((e) => ({ sql: e.sql, durationMs: Math.round(e.durationMs) }));

  return {
    queriesPerMin: Math.round((count / windowMs) * 60_000),
    avgQueryMs: count ? Math.round((totalMs / count) * 10) / 10 : 0,
    slowQueryCount: slowCount,
    slowestQueries,
  };
}
