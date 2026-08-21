import { describe, it, expect } from "vitest";
import { ScanSchema, UpsertIpSchema, ListSchema, PendingRepackSchema } from "../../dtos/ipAddresses.dto.js";

describe("UpsertIpSchema", () => {
  it("requires a valid IPv4 address", () => {
    expect(UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "bolnica" }).success).toBe(
      true,
    );
    expect(UpsertIpSchema.safeParse({ ip: "garbage", site: "bolnica" }).success).toBe(false);
  });

  it("accepts a known entryType and rejects an unknown one", () => {
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "bolnica", entryType: "computer" })
        .success,
    ).toBe(true);
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "bolnica", entryType: "printer" })
        .success,
    ).toBe(false);
  });

  it("accepts null entryType (unknown/unclassified)", () => {
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "bolnica", entryType: null }).success,
    ).toBe(true);
  });

  it("requires site (manual choice, no default) and rejects an unknown value", () => {
    expect(UpsertIpSchema.safeParse({ ip: "10.230.62.81" }).success).toBe(false);
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "neka_treca_lokacija" }).success,
    ).toBe(false);
    expect(
      UpsertIpSchema.safeParse({ ip: "10.230.62.81", site: "dom_zdravlja" }).success,
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

  it(
    "normalizes department/os/rdpApp filters to an array regardless of whether the query " +
      "string sent one value (plain string) or several (repeated param, arrives as an array)",
    () => {
      const single = ListSchema.parse({ department: "Apoteka", os: "Windows 10" });
      expect(single.department).toEqual(["Apoteka"]);
      expect(single.os).toEqual(["Windows 10"]);

      const multi = ListSchema.parse({ department: ["Apoteka", "Lab"], rdpApp: ["AnyDesk", "TeamViewer"] });
      expect(multi.department).toEqual(["Apoteka", "Lab"]);
      expect(multi.rdpApp).toEqual(["AnyDesk", "TeamViewer"]);
    },
  );

  it("defaults department/os/rdpApp to an empty array when omitted", () => {
    const out = ListSchema.parse({});
    expect(out.department).toEqual([]);
    expect(out.os).toEqual([]);
    expect(out.rdpApp).toEqual([]);
  });

  it("caps limit at 1000", () => {
    expect(ListSchema.safeParse({ limit: 5000 }).success).toBe(false);
    expect(ListSchema.safeParse({ limit: 1000 }).success).toBe(true);
  });

  it("accepts an optional site filter and rejects an unknown value", () => {
    expect(ListSchema.safeParse({}).success).toBe(true);
    expect(ListSchema.safeParse({ site: "bolnica" }).success).toBe(true);
    expect(ListSchema.safeParse({ site: "neka_treca_lokacija" }).success).toBe(false);
  });

  it(
    "pendingRepack is false unless the query string is literally '1' or 'true' " +
      "(query params always arrive as strings, so a naive z.coerce.boolean() would treat '0'/'false' as true)",
    () => {
      expect(ListSchema.parse({}).pendingRepack).toBe(false);
      expect(ListSchema.parse({ pendingRepack: "0" }).pendingRepack).toBe(false);
      expect(ListSchema.parse({ pendingRepack: "false" }).pendingRepack).toBe(false);
      expect(ListSchema.parse({ pendingRepack: "1" }).pendingRepack).toBe(true);
      expect(ListSchema.parse({ pendingRepack: "true" }).pendingRepack).toBe(true);
    },
  );
});

describe("PendingRepackSchema", () => {
  it("requires a real boolean pendingRepack field", () => {
    expect(PendingRepackSchema.safeParse({ pendingRepack: true }).success).toBe(true);
    expect(PendingRepackSchema.safeParse({ pendingRepack: false }).success).toBe(true);
    expect(PendingRepackSchema.safeParse({}).success).toBe(false);
    expect(PendingRepackSchema.safeParse({ pendingRepack: "yes" }).success).toBe(false);
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
