import { describe, it, expect } from "vitest";
import { FlagDomainSchema } from "../../dtos/dnsLogs.dto.js";

describe("FlagDomainSchema", () => {
  it("accepts a domain with an optional reason", () => {
    expect(FlagDomainSchema.safeParse({ domain: "evil.example.com" }).success).toBe(true);
    expect(
      FlagDomainSchema.safeParse({ domain: "evil.example.com", reason: "poznat C2 domen" }).success,
    ).toBe(true);
  });

  it("rejects a missing/empty domain", () => {
    expect(FlagDomainSchema.safeParse({}).success).toBe(false);
    expect(FlagDomainSchema.safeParse({ domain: "" }).success).toBe(false);
  });
});
