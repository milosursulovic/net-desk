import { describe, it, expect } from "vitest";
import { emptyToNull } from "../../utils/strings.js";

describe("emptyToNull", () => {
  it("returns null for null/undefined", () => {
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull(undefined)).toBeNull();
  });

  it("returns null for empty or whitespace-only strings", () => {
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("   ")).toBeNull();
  });

  it("trims and returns non-empty strings", () => {
    expect(emptyToNull("  hello  ")).toBe("hello");
    expect(emptyToNull("hello")).toBe("hello");
  });

  it("coerces non-string values to string", () => {
    expect(emptyToNull(42)).toBe("42");
    expect(emptyToNull(0)).toBe("0");
  });
});
