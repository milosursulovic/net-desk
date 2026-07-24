import { describe, it, expect } from "vitest";
import {
  CreateJobSchema,
  BatchCreateJobSchema,
  JobResultSchema,
  COMMAND_TYPES,
} from "../../dtos/agentJobs.dto.js";

describe("CreateJobSchema", () => {
  it("accepts every documented command type with no payload", () => {
    for (const commandType of COMMAND_TYPES) {
      if (["restart_service", "start_service", "stop_service", "run_powershell_script"].includes(commandType)) {
        continue; // these require a payload, covered separately below
      }
      const out = CreateJobSchema.safeParse({ commandType });
      expect(out.success, `expected ${commandType} to pass without payload`).toBe(true);
    }
  });

  it("rejects an unknown command type", () => {
    expect(CreateJobSchema.safeParse({ commandType: "format_disk" }).success).toBe(false);
  });

  it("requires payload.serviceName for service commands", () => {
    for (const commandType of ["restart_service", "start_service", "stop_service"]) {
      expect(CreateJobSchema.safeParse({ commandType }).success).toBe(false);
      expect(
        CreateJobSchema.safeParse({ commandType, payload: {} }).success,
      ).toBe(false);
      expect(
        CreateJobSchema.safeParse({ commandType, payload: { serviceName: "   " } }).success,
      ).toBe(false);
      expect(
        CreateJobSchema.safeParse({ commandType, payload: { serviceName: "Spooler" } })
          .success,
      ).toBe(true);
    }
  });

  it("requires payload.script for run_powershell_script", () => {
    expect(
      CreateJobSchema.safeParse({ commandType: "run_powershell_script" }).success,
    ).toBe(false);
    expect(
      CreateJobSchema.safeParse({
        commandType: "run_powershell_script",
        payload: { script: "Get-Process" },
      }).success,
    ).toBe(true);
  });

  it("accepts an empty {} payload for commands that don't need one (regression: frontend always sends {})", () => {
    // AgentDetailView.vue always sends `payload: {}` regardless of command
    // type, never null/undefined - confirm that isn't accidentally rejected.
    const out = CreateJobSchema.safeParse({ commandType: "collect_inventory", payload: {} });
    expect(out.success).toBe(true);
  });
});

describe("BatchCreateJobSchema", () => {
  it("accepts a valid agentIds list alongside a valid command", () => {
    const out = BatchCreateJobSchema.safeParse({
      commandType: "delete_temp_files",
      agentIds: [1, 2, 3],
    });
    expect(out.success).toBe(true);
  });

  it("rejects an empty agentIds array", () => {
    expect(
      BatchCreateJobSchema.safeParse({ commandType: "delete_temp_files", agentIds: [] }).success,
    ).toBe(false);
  });

  it("rejects a missing agentIds field", () => {
    expect(
      BatchCreateJobSchema.safeParse({ commandType: "delete_temp_files" }).success,
    ).toBe(false);
  });

  it("still enforces the same per-command payload rules as CreateJobSchema", () => {
    expect(
      BatchCreateJobSchema.safeParse({
        commandType: "run_powershell_script",
        agentIds: [1],
      }).success,
    ).toBe(false);
    expect(
      BatchCreateJobSchema.safeParse({
        commandType: "run_powershell_script",
        payload: { script: "Get-Process" },
        agentIds: [1],
      }).success,
    ).toBe(true);
  });
});

describe("JobResultSchema", () => {
  it("accepts a successful result report", () => {
    const out = JobResultSchema.safeParse({
      exitCode: 0,
      output: "Inventar sinhronizovan.",
      success: true,
      durationMs: 1234,
    });
    expect(out.success).toBe(true);
  });

  it("rejects a negative durationMs", () => {
    expect(JobResultSchema.safeParse({ durationMs: -1 }).success).toBe(false);
  });

  it("accepts an empty object (all fields optional)", () => {
    expect(JobResultSchema.safeParse({}).success).toBe(true);
  });
});
