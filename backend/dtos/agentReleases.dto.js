import { z } from "zod";

export const DEPLOYMENT_GROUPS = ["test", "it", "pilot", "rest"];

export const CreateReleaseSchema = z.object({
  version: z.string().min(1).max(50),
  deploymentGroup: z.enum(DEPLOYMENT_GROUPS).default("rest"),
  releaseNotes: z.string().nullable().optional(),
});

export const UpdateReportSchema = z.object({
  fromVersion: z.string().max(50).nullable().optional(),
  toVersion: z.string().max(50).nullable().optional(),
  success: z.boolean(),
  reason: z.string().nullable().optional(),
});

export const DeploymentGroupSchema = z.object({
  deploymentGroup: z.enum(DEPLOYMENT_GROUPS),
});
