import { describe, it, expect } from "vitest";
import {
  EnrollSchema,
  HeartbeatSchema,
  InventorySyncSchema,
} from "../../dtos/agents.dto.js";

describe("EnrollSchema", () => {
  it("accepts a full payload", () => {
    const out = EnrollSchema.safeParse({
      hostname: "DESKTOP-TOUNABC",
      osCaption: "Microsoft Windows 10 Pro",
      osVersion: "10.0.19045",
      osBuild: "19045",
      agentVersion: "1.0.0",
    });
    expect(out.success).toBe(true);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(EnrollSchema.safeParse({}).success).toBe(true);
  });
});

describe("HeartbeatSchema", () => {
  it("accepts a well-formed heartbeat with monitoring data", () => {
    const out = HeartbeatSchema.safeParse({
      hostname: "DESKTOP-TOUNABC",
      agentVersion: "1.0.0",
      uptimeSeconds: 3600,
      monitoring: {
        cpuLoadPct: 12.5,
        ramLoadPct: 40,
        diskUsedPct: 55,
        diskFreeGb: 120.4,
        networkConnected: true,
        antivirusStatus: "enabled",
        firewallStatus: "enabled",
        bitlockerStatus: "on",
        temperatureC: 45.2,
      },
    });
    expect(out.success).toBe(true);
  });

  it("rejects a negative uptimeSeconds (regression: Environment.TickCount overflow bug)", () => {
    // Environment.TickCount wraps negative after ~24.9 days of uptime -
    // this schema is what turned that into a hard-rejected heartbeat
    // (HTTP 400) instead of silently accepting garbage. See
    // AgentWorker.cs's switch to GetTickCount64.
    const out = HeartbeatSchema.safeParse({ uptimeSeconds: -12345 });
    expect(out.success).toBe(false);
  });

  it("rejects a monitoring percentage above 100", () => {
    const out = HeartbeatSchema.safeParse({
      monitoring: { cpuLoadPct: 150 },
    });
    expect(out.success).toBe(false);
  });

  it("accepts a heartbeat with no monitoring data at all", () => {
    expect(HeartbeatSchema.safeParse({}).success).toBe(true);
  });
});

describe("InventorySyncSchema", () => {
  it("requires a valid IPv4 address", () => {
    expect(InventorySyncSchema.safeParse({ ip: "10.230.62.81" }).success).toBe(true);
    expect(InventorySyncSchema.safeParse({ ip: "not-an-ip" }).success).toBe(false);
    expect(InventorySyncSchema.safeParse({}).success).toBe(false);
  });

  it("is passthrough - keeps unrecognized top-level fields like OS/System/CPU", () => {
    // These fields are intentionally unvalidated here (see the comment in
    // the schema file) - metadata.service.js's pick()-based parsing handles
    // them tolerantly. Confirm passthrough actually preserves them rather
    // than stripping unknown keys, since a strict schema would silently
    // drop the entire metadata payload.
    const out = InventorySyncSchema.safeParse({
      ip: "10.230.62.81",
      OS: { Caption: "Windows 10" },
      System: { Manufacturer: "HP" },
    });
    expect(out.success).toBe(true);
    expect(out.data.OS).toEqual({ Caption: "Windows 10" });
    expect(out.data.System).toEqual({ Manufacturer: "HP" });
  });

  it("accepts a minimal event-log-only payload (no software/drivers/etc)", () => {
    const out = InventorySyncSchema.safeParse({
      ip: "10.230.62.81",
      eventLogs: [{ logName: "System", level: "Error" }],
    });
    expect(out.success).toBe(true);
  });
});
