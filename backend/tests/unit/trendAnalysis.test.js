import { describe, it, expect } from "vitest";
import {
  computeDiskFillProjection,
  computeCpuLoadProjection,
  computeRamLoadProjection,
  computeDiskAnomaly,
  computeCpuAnomaly,
  computeRamAnomaly,
} from "../../utils/trendAnalysis.js";

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe("computeDiskFillProjection", () => {
  it("returns null with fewer than minPoints history rows", () => {
    const rows = [
      { diskUsedPct: 50, recordedAt: daysAgo(1) },
      { diskUsedPct: 52, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskFillProjection(rows)).toBeNull();
  });

  it("returns null for a flat trend (no growth)", () => {
    const rows = [
      { diskUsedPct: 50, recordedAt: daysAgo(4) },
      { diskUsedPct: 50, recordedAt: daysAgo(3) },
      { diskUsedPct: 50, recordedAt: daysAgo(2) },
      { diskUsedPct: 50, recordedAt: daysAgo(1) },
      { diskUsedPct: 50, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskFillProjection(rows)).toBeNull();
  });

  it("returns null for a decreasing trend (disk was cleaned up)", () => {
    const rows = [
      { diskUsedPct: 80, recordedAt: daysAgo(4) },
      { diskUsedPct: 70, recordedAt: daysAgo(3) },
      { diskUsedPct: 60, recordedAt: daysAgo(2) },
      { diskUsedPct: 50, recordedAt: daysAgo(1) },
      { diskUsedPct: 40, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskFillProjection(rows)).toBeNull();
  });

  it("returns null when already at/above the threshold (that's the disk-full alert's job, not a trend)", () => {
    const rows = [
      { diskUsedPct: 88, recordedAt: daysAgo(2) },
      { diskUsedPct: 90, recordedAt: daysAgo(1) },
      { diskUsedPct: 92, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskFillProjection(rows)).toBeNull();
  });

  it("returns null when the projected fill date is beyond maxDays", () => {
    // growing 0.01%/day - would take thousands of days to hit 90%
    const rows = [
      { diskUsedPct: 50.0, recordedAt: daysAgo(4) },
      { diskUsedPct: 50.01, recordedAt: daysAgo(3) },
      { diskUsedPct: 50.02, recordedAt: daysAgo(2) },
      { diskUsedPct: 50.03, recordedAt: daysAgo(1) },
      { diskUsedPct: 50.04, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskFillProjection(rows)).toBeNull();
  });

  it("projects days-until-threshold for a clear rising trend", () => {
    // +5%/day starting at 50% -> crosses 90% in 8 days
    const rows = [
      { diskUsedPct: 50, recordedAt: daysAgo(4) },
      { diskUsedPct: 55, recordedAt: daysAgo(3) },
      { diskUsedPct: 60, recordedAt: daysAgo(2) },
      { diskUsedPct: 65, recordedAt: daysAgo(1) },
      { diskUsedPct: 70, recordedAt: daysAgo(0) },
    ];
    const result = computeDiskFillProjection(rows);
    expect(result).not.toBeNull();
    expect(result.slopePctPerDay).toBeCloseTo(5, 1);
    expect(result.currentPct).toBe(70);
    expect(result.daysUntilThreshold).toBe(4);
  });

  it("ignores rows with a null diskUsedPct rather than crashing", () => {
    const rows = [
      { diskUsedPct: 50, recordedAt: daysAgo(4) },
      { diskUsedPct: null, recordedAt: daysAgo(3) },
      { diskUsedPct: 60, recordedAt: daysAgo(2) },
      { diskUsedPct: 70, recordedAt: daysAgo(1) },
      { diskUsedPct: 80, recordedAt: daysAgo(0) },
    ];
    const result = computeDiskFillProjection(rows);
    expect(result).not.toBeNull();
  });

  it("works regardless of input row order (sorts internally)", () => {
    const rows = [
      { diskUsedPct: 70, recordedAt: daysAgo(0) },
      { diskUsedPct: 50, recordedAt: daysAgo(4) },
      { diskUsedPct: 60, recordedAt: daysAgo(2) },
    ];
    const result = computeDiskFillProjection(rows);
    expect(result).not.toBeNull();
    expect(result.currentPct).toBe(70);
  });
});

describe("computeCpuLoadProjection / computeRamLoadProjection", () => {
  it("projects a rising CPU trend using cpuLoadPct instead of diskUsedPct", () => {
    const rows = [
      { cpuLoadPct: 50, recordedAt: daysAgo(4) },
      { cpuLoadPct: 55, recordedAt: daysAgo(3) },
      { cpuLoadPct: 60, recordedAt: daysAgo(2) },
      { cpuLoadPct: 65, recordedAt: daysAgo(1) },
      { cpuLoadPct: 70, recordedAt: daysAgo(0) },
    ];
    const result = computeCpuLoadProjection(rows);
    expect(result).not.toBeNull();
    expect(result.currentPct).toBe(70);
    expect(result.daysUntilThreshold).toBe(4);
  });

  it("projects a rising RAM trend using ramLoadPct instead of diskUsedPct", () => {
    const rows = [
      { ramLoadPct: 50, recordedAt: daysAgo(4) },
      { ramLoadPct: 55, recordedAt: daysAgo(3) },
      { ramLoadPct: 60, recordedAt: daysAgo(2) },
      { ramLoadPct: 65, recordedAt: daysAgo(1) },
      { ramLoadPct: 70, recordedAt: daysAgo(0) },
    ];
    const result = computeRamLoadProjection(rows);
    expect(result).not.toBeNull();
    expect(result.currentPct).toBe(70);
  });

  it("returns null for a flat CPU trend, same rules as disk", () => {
    const rows = [
      { cpuLoadPct: 20, recordedAt: daysAgo(2) },
      { cpuLoadPct: 20, recordedAt: daysAgo(1) },
      { cpuLoadPct: 20, recordedAt: daysAgo(0) },
    ];
    expect(computeCpuLoadProjection(rows)).toBeNull();
  });
});

describe("computeDiskAnomaly / computeCpuAnomaly / computeRamAnomaly", () => {
  it("returns null with fewer than minPoints history rows", () => {
    const rows = [
      { diskUsedPct: 40, recordedAt: daysAgo(1) },
      { diskUsedPct: 90, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskAnomaly(rows)).toBeNull();
  });

  it("returns null when today's value is close to the historical baseline", () => {
    const rows = [
      { cpuLoadPct: 20, recordedAt: daysAgo(7) },
      { cpuLoadPct: 21, recordedAt: daysAgo(6) },
      { cpuLoadPct: 19, recordedAt: daysAgo(5) },
      { cpuLoadPct: 22, recordedAt: daysAgo(4) },
      { cpuLoadPct: 20, recordedAt: daysAgo(3) },
      { cpuLoadPct: 21, recordedAt: daysAgo(2) },
      { cpuLoadPct: 19, recordedAt: daysAgo(1) },
      { cpuLoadPct: 20, recordedAt: daysAgo(0) },
    ];
    expect(computeCpuAnomaly(rows)).toBeNull();
  });

  it("flags a sudden spike far outside the historical baseline (bidirectional z-score)", () => {
    const rows = [
      { ramLoadPct: 30, recordedAt: daysAgo(7) },
      { ramLoadPct: 31, recordedAt: daysAgo(6) },
      { ramLoadPct: 29, recordedAt: daysAgo(5) },
      { ramLoadPct: 30, recordedAt: daysAgo(4) },
      { ramLoadPct: 31, recordedAt: daysAgo(3) },
      { ramLoadPct: 29, recordedAt: daysAgo(2) },
      { ramLoadPct: 30, recordedAt: daysAgo(1) },
      { ramLoadPct: 95, recordedAt: daysAgo(0) }, // today's spike, way outside ~30 +/- 1
    ];
    const result = computeRamAnomaly(rows);
    expect(result).not.toBeNull();
    expect(result.currentValue).toBe(95);
    expect(result.zScore).toBeGreaterThan(3);
  });

  it("returns null when the baseline has zero variance (would divide by zero)", () => {
    const rows = [
      { diskUsedPct: 50, recordedAt: daysAgo(7) },
      { diskUsedPct: 50, recordedAt: daysAgo(6) },
      { diskUsedPct: 50, recordedAt: daysAgo(5) },
      { diskUsedPct: 50, recordedAt: daysAgo(4) },
      { diskUsedPct: 50, recordedAt: daysAgo(3) },
      { diskUsedPct: 50, recordedAt: daysAgo(2) },
      { diskUsedPct: 50, recordedAt: daysAgo(1) },
      { diskUsedPct: 90, recordedAt: daysAgo(0) },
    ];
    expect(computeDiskAnomaly(rows)).toBeNull();
  });
});
