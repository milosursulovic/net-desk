import { describe, it, expect } from "vitest";
import { toInt, clamp } from "../../utils/numbers.js";

describe("toInt", () => {
  it("parses valid integer-like strings/numbers", () => {
    expect(toInt("42")).toBe(42);
    expect(toInt(42)).toBe(42);
    expect(toInt("42.9")).toBe(42);
  });

  it("falls back to the default for unparseable input", () => {
    expect(toInt("abc")).toBeNull();
    expect(toInt(undefined)).toBeNull();
    expect(toInt(null, 5)).toBe(5);
    expect(toInt("not a number", 1)).toBe(1);
  });
});

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-5, 1, 10)).toBe(1);
    expect(clamp(50, 1, 10)).toBe(10);
  });

  it("handles boundary values", () => {
    expect(clamp(1, 1, 10)).toBe(1);
    expect(clamp(10, 1, 10)).toBe(10);
  });
});
