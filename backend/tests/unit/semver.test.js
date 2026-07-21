import { describe, it, expect } from "vitest";
import { compareVersions, isNewerVersion } from "../../utils/semver.js";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns positive when a > b", () => {
    expect(compareVersions("1.3.0", "1.2.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });

  it("returns negative when a < b", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
  });

  it("handles differing segment counts", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBeGreaterThan(0);
  });

  it("treats missing/garbage input as version 0", () => {
    expect(compareVersions(null, "0.0.1")).toBeLessThan(0);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });
});

describe("isNewerVersion", () => {
  it("is true only when candidate strictly exceeds current", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
  });
});
