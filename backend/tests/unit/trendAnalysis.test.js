import { describe, it, expect } from "vitest";
import { computeDiskFillProjection } from "../../utils/trendAnalysis.js";

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
