// Pure calculation, no I/O - takes already-fetched history points and
// returns a projection or null. Deliberately conservative: with too few
// points, a flat/decreasing trend, or an already-past-threshold value, it
// returns null rather than a noisy/misleading projection - the report only
// surfaces genuinely actionable "X will fill up in Y days" entries, not a
// row for every agent every day.

// Ordinary least-squares slope over (x, y) points - x is day-offset from
// the first point, y is the metric value. Returns % change per day.
function linearRegressionSlope(points) {
  const n = points.length;
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.x - xMean) * (p.y - yMean);
    denominator += (p.x - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * historyRows: [{ diskUsedPct, recordedAt }], any order, same agent.
 * Returns { slopePctPerDay, currentPct, daysUntilThreshold } or null.
 */
export function computeDiskFillProjection(
  historyRows,
  { threshold = 90, minPoints = 3, maxDays = 365 } = {},
) {
  const sorted = [...historyRows]
    .filter((r) => r.diskUsedPct != null)
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  if (sorted.length < minPoints) return null;

  const firstMs = new Date(sorted[0].recordedAt).getTime();
  const points = sorted.map((r) => ({
    x: (new Date(r.recordedAt).getTime() - firstMs) / 86400000,
    y: Number(r.diskUsedPct),
  }));

  const currentPct = points[points.length - 1].y;
  if (currentPct >= threshold) return null; // already full - covered by the existing disk-full alert, not a "trend"

  const slopePctPerDay = linearRegressionSlope(points);
  if (slopePctPerDay <= 0) return null; // flat or emptying - no risk

  const daysUntilThreshold = (threshold - currentPct) / slopePctPerDay;
  if (!Number.isFinite(daysUntilThreshold) || daysUntilThreshold > maxDays) {
    return null; // trending up too slowly to be worth flagging
  }

  return {
    slopePctPerDay,
    currentPct,
    daysUntilThreshold: Math.round(daysUntilThreshold),
  };
}
