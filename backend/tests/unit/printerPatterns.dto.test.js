import { describe, it, expect } from "vitest";
import { PrinterPatternSchema } from "../../dtos/printerPatterns.dto.js";

describe("PrinterPatternSchema", () => {
  it("accepts a pattern with an optional reason", () => {
    expect(PrinterPatternSchema.safeParse({ pattern: "print to pdf" }).success).toBe(true);
    expect(
      PrinterPatternSchema.safeParse({ pattern: "print to pdf", reason: "virtuelni štampač" }).success,
    ).toBe(true);
  });

  it("rejects a missing/empty pattern", () => {
    expect(PrinterPatternSchema.safeParse({}).success).toBe(false);
    expect(PrinterPatternSchema.safeParse({ pattern: "" }).success).toBe(false);
  });
});
