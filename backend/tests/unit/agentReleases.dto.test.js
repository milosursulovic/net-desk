import { describe, it, expect } from "vitest";
import {
  CreateReleaseSchema,
  UpdateReleaseGroupsSchema,
  UpdateReleaseNotesSchema,
} from "../../dtos/agentReleases.dto.js";

describe("UpdateReleaseGroupsSchema", () => {
  it("accepts a release targeting more than 20 groups (department-aligned groups, not the old fixed 4-value list)", () => {
    // Regression: max was 20, but a real fleet already has 49 distinct
    // departments across both sites - a release rolling out to most/all
    // departments legitimately needs more than 20 groups.
    const groups = Array.from({ length: 30 }, (_, i) => `Odeljenje ${i}`);
    const result = UpdateReleaseGroupsSchema.safeParse({ deploymentGroups: groups });
    expect(result.success).toBe(true);
  });

  it("rejects an empty deploymentGroups array", () => {
    expect(UpdateReleaseGroupsSchema.safeParse({ deploymentGroups: [] }).success).toBe(false);
  });

  it("still rejects an absurdly large array (sanity ceiling, not unlimited)", () => {
    const groups = Array.from({ length: 101 }, (_, i) => `Grupa ${i}`);
    expect(UpdateReleaseGroupsSchema.safeParse({ deploymentGroups: groups }).success).toBe(false);
  });
});

describe("CreateReleaseSchema", () => {
  it("accepts an upload targeting more than 20 groups", () => {
    const groups = Array.from({ length: 30 }, (_, i) => `Odeljenje ${i}`);
    const result = CreateReleaseSchema.safeParse({ version: "1.6.0", deploymentGroups: groups });
    expect(result.success).toBe(true);
  });
});

describe("UpdateReleaseNotesSchema", () => {
  it("accepts a plain string", () => {
    expect(UpdateReleaseNotesSchema.safeParse({ releaseNotes: "dodatna napomena" }).success).toBe(true);
  });

  it("accepts null (clearing the notes)", () => {
    expect(UpdateReleaseNotesSchema.safeParse({ releaseNotes: null }).success).toBe(true);
  });

  it("rejects a missing releaseNotes field (undefined is not the same as null)", () => {
    expect(UpdateReleaseNotesSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an absurdly long note (sanity ceiling)", () => {
    expect(UpdateReleaseNotesSchema.safeParse({ releaseNotes: "x".repeat(4001) }).success).toBe(false);
  });
});
