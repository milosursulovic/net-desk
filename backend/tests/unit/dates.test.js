import { describe, it, expect } from "vitest";
import { parseDateMaybe } from "../../utils/dates.js";

describe("parseDateMaybe", () => {
  it("returns null for null/undefined/empty string", () => {
    expect(parseDateMaybe(null)).toBeNull();
    expect(parseDateMaybe(undefined)).toBeNull();
    expect(parseDateMaybe("")).toBeNull();
  });

  it("parses a valid ISO date string", () => {
    const d = parseDateMaybe("2026-07-21T00:00:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it("returns null for garbage strings instead of throwing", () => {
    // Regression: real agent InstallDate value seen live ("1784235052")
    // used to crash the MySQL insert before this guard existed.
    expect(parseDateMaybe("1784235052")).toBeNull();
    expect(parseDateMaybe("not a date")).toBeNull();
  });

  it("passes an existing Date instance through unchanged", () => {
    const now = new Date();
    expect(parseDateMaybe(now)).toBe(now);
  });

  it("parses a { $date } wrapper object", () => {
    const d = parseDateMaybe({ $date: "2026-01-01T00:00:00.000Z" });
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCFullYear()).toBe(2026);
  });

  it("returns null for unsupported types", () => {
    expect(parseDateMaybe(true)).toBeNull();
    expect(parseDateMaybe({})).toBeNull();
    expect(parseDateMaybe([])).toBeNull();
  });
});
