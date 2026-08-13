import { z } from "zod";

export const CreateDeploymentGroupSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

export const AgentDeploymentGroupSchema = z.object({
  groupName: z.string().trim().min(1).max(150),
});
