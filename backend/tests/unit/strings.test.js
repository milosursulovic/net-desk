import { describe, it, expect } from "vitest";
import { emptyToNull, sanitizeText } from "../../utils/strings.js";

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

describe("sanitizeText", () => {
  it("returns null for null/undefined", () => {
    expect(sanitizeText(null, 100)).toBeNull();
    expect(sanitizeText(undefined, 100)).toBeNull();
  });

  it(
    "drops everything from the first null byte onward, not just a single " +
      "trailing one (regression: a BIXOLON printer driver's registry entry " +
      "padded DisplayVersion with hundreds of null bytes past the real value, " +
      "crashing the whole insert against a varchar(100) column live)",
    () => {
      const padded = "5.1.12.6055" + "\0".repeat(500);
      expect(sanitizeText(padded, 100)).toBe("5.1.12.6055");
    },
  );

  it("hard-truncates to maxLength even for an otherwise-clean but too-long value", () => {
    const long = "a".repeat(300);
    expect(sanitizeText(long, 100)).toHaveLength(100);
    expect(sanitizeText(long, 100)).toBe("a".repeat(100));
  });

  it("trims whitespace and returns null when nothing is left", () => {
    expect(sanitizeText("   ", 100)).toBeNull();
    expect(sanitizeText("\0\0\0", 100)).toBeNull();
    expect(sanitizeText("  hello  ", 100)).toBe("hello");
  });

  it("returns the untruncated cleaned value when maxLength is omitted", () => {
    expect(sanitizeText("hello\0garbage", undefined)).toBe("hello");
  });
});
