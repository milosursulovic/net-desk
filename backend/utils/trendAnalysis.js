// Pure calculations, no I/O - take already-fetched history points and
// return a projection/anomaly or null. Deliberately conservative: with too
// few points, a flat/decreasing trend, or an already-past-threshold value,
// these return null rather than a noisy/misleading result - the report only
// surfaces genuinely actionable entries, not a row for every agent every day.

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

function sortedPoints(historyRows, metricKey) {
  const sorted = [...historyRows]
    .filter((r) => r[metricKey] != null)
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

  return sorted;
}

/**
 * historyRows: [{ [metricKey]: number, recordedAt }], any order, same agent.
 * Returns { slopePctPerDay, currentPct, daysUntilThreshold } or null.
 */
function computeThresholdProjection(
  historyRows,
  metricKey,
  { threshold = 90, minPoints = 3, maxDays = 365 } = {},
) {
  const sorted = sortedPoints(historyRows, metricKey);
  if (sorted.length < minPoints) return null;

  const firstMs = new Date(sorted[0].recordedAt).getTime();
  const points = sorted.map((r) => ({
    x: (new Date(r.recordedAt).getTime() - firstMs) / 86400000,
    y: Number(r[metricKey]),
  }));

  const currentPct = points[points.length - 1].y;
  if (currentPct >= threshold) return null; // already at/above threshold - covered by the existing alert, not a "trend"

  const slopePctPerDay = linearRegressionSlope(points);
  if (slopePctPerDay <= 0) return null; // flat or falling - no risk

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

export function computeDiskFillProjection(historyRows, options) {
  return computeThresholdProjection(historyRows, "diskUsedPct", options);
}

export function computeCpuLoadProjection(historyRows, options) {
  return computeThresholdProjection(historyRows, "cpuLoadPct", options);
}

export function computeRamLoadProjection(historyRows, options) {
  return computeThresholdProjection(historyRows, "ramLoadPct", options);
}

/**
 * Anomaly = today's value deviates from THIS agent's own historical pattern
 * (mean +/- stddev over the window, excluding today's point), regardless of
 * any trend - catches a one-off spike/drop a linear regression would never
 * see (e.g. RAM usage triples for a day then returns to normal). z-score
 * based, bidirectional (both unusually high and unusually low are surfaced -
 * "different from usual" is the point, not "high").
 *
 * historyRows: [{ [metricKey]: number, recordedAt }], any order, same agent.
 * Returns { currentValue, baselineMean, baselineStdDev, zScore } or null.
 */
function computeMetricAnomaly(
  historyRows,
  metricKey,
  { minPoints = 7, zThreshold = 3 } = {},
) {
  const sorted = sortedPoints(historyRows, metricKey);
  if (sorted.length < minPoints) return null;

  const latest = sorted[sorted.length - 1];
  const baseline = sorted.slice(0, -1).map((r) => Number(r[metricKey]));

  const baselineMean = baseline.reduce((sum, v) => sum + v, 0) / baseline.length;
  const variance =
    baseline.reduce((sum, v) => sum + (v - baselineMean) ** 2, 0) / baseline.length;
  const baselineStdDev = Math.sqrt(variance);

  if (baselineStdDev === 0) return null; // no variation in baseline - z-score would be meaningless (div by 0)

  const currentValue = Number(latest[metricKey]);
  const zScore = (currentValue - baselineMean) / baselineStdDev;
  if (Math.abs(zScore) < zThreshold) return null;

  return { currentValue, baselineMean, baselineStdDev, zScore };
}

export function computeDiskAnomaly(historyRows, options) {
  return computeMetricAnomaly(historyRows, "diskUsedPct", options);
}

export function computeCpuAnomaly(historyRows, options) {
  return computeMetricAnomaly(historyRows, "cpuLoadPct", options);
}

export function computeRamAnomaly(historyRows, options) {
  return computeMetricAnomaly(historyRows, "ramLoadPct", options);
}
