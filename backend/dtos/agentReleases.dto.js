import { z } from "zod";

// The classic base values now live in deployment_groups_list (seeded in
// migration 0006_deployment_groups_multi.sql), not as a constant here -
// deployment groups are a separate list from departments (groups_list).
const DeploymentGroupValue = z.string().trim().min(1).max(150);

// 100 (not 20) - purely a sanity ceiling, not a business rule. The org already
// has 49 real departments across both sites (deployment groups are now
// aligned with departments, not a fixed 4-value list), so 20 was actually
// reachable and blocked a legitimate rollout to all departments.
const MAX_DEPLOYMENT_GROUPS = 100;

export const CreateReleaseSchema = z.object({
  version: z.string().min(1).max(50),
  // A release now targets SEVERAL groups at once (agent_release_groups table) -
  // not a single scalar value as before.
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(MAX_DEPLOYMENT_GROUPS),
  releaseNotes: z.string().nullable().optional(),
});

export const UpdateReportSchema = z.object({
  fromVersion: z.string().max(50).nullable().optional(),
  toVersion: z.string().max(50).nullable().optional(),
  success: z.boolean(),
  reason: z.string().nullable().optional(),
});

// For "widening" a rollout - changes the SET of targeted groups on an already
// uploaded release (full replace, not append - the frontend sends the old set +
// new groups to "widen", or a smaller set to narrow).
export const UpdateReleaseGroupsSchema = z.object({
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(MAX_DEPLOYMENT_GROUPS),
});

// Notes stay editable after upload (unlike the version/file) - null is a
// valid value (clearing the note), an empty string is normalized to null in
// the service.
export const UpdateReleaseNotesSchema = z.object({
  releaseNotes: z.string().max(4000).nullable(),
});
