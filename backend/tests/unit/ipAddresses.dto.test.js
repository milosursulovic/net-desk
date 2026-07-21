import { describe, it, expect } from "vitest";
import { ScanSchema, UpsertIpSchema, ListSchema } from "../../dtos/ipAddresses.dto.js";

describe("UpsertIpSchema", () => {
  it("requires a valid IPv4 address", () => {
    expect(UpsertIpSchema.safeParse({ ip: "10.230.62.81" }).success).toBe(true);
    expect(UpsertIpSchema.safeParse({ ip: "garbage" }).success).toBe(false);
  });

  it("accepts a known entryType and rejects an unknown one", () => {
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", entryType: "computer" }).success,
    ).toBe(true);
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", entryType: "printer" }).success,
    ).toBe(false);
  });

  it("accepts null entryType (unknown/unclassified)", () => {
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", entryType: null }).success,
    ).toBe(true);
  });
});

describe("ListSchema", () => {
  it("defaults page/limit/sortBy/status/entryType when omitted", () => {
    const out = ListSchema.parse({});
    expect(out.page).toBe(1);
    expect(out.limit).toBe(10);
    expect(out.sortBy).toBe("ip");
    expect(out.sortOrder).toBe("asc");
    expect(out.status).toBe("all");
    expect(out.entryType).toBe("all");
  });

  it("rejects an unknown sortBy column (prevents SQL injection via ORDER BY)", () => {
    expect(ListSchema.safeParse({ sortBy: "1; DROP TABLE ip_entries" }).success).toBe(
      false,
    );
  });

  it("accepts optional department and os filters as free strings", () => {
    const out = ListSchema.parse({ department: "Apoteka", os: "Windows 10" });
    expect(out.department).toBe("Apoteka");
    expect(out.os).toBe("Windows 10");
  });

  it("caps limit at 1000", () => {
    expect(ListSchema.safeParse({ limit: 5000 }).success).toBe(false);
    expect(ListSchema.safeParse({ limit: 1000 }).success).toBe(true);
  });
});

describe("ScanSchema", () => {
  it("defaults timeoutMs and concurrency", () => {
    const out = ScanSchema.parse({ ip: "10.230.62.81" });
    expect(out.timeoutMs).toBe(100);
    expect(out.concurrency).toBe(64);
  });

  it("rejects an invalid IP", () => {
    expect(ScanSchema.safeParse({ ip: "not-an-ip" }).success).toBe(false);
  });

  it("bounds concurrency to a sane range", () => {
    expect(ScanSchema.safeParse({ ip: "10.230.62.81", concurrency: 0 }).success).toBe(
      false,
    );
    expect(
      ScanSchema.safeParse({ ip: "10.230.62.81", concurrency: 5000 }).success,
    ).toBe(false);
  });
});
