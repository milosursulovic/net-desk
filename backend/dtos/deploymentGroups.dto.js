import { z } from "zod";

export const CreateDeploymentGroupSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

export const AgentDeploymentGroupSchema = z.object({
  groupName: z.string().trim().min(1).max(150),
});

// Same agentIds shape/limit as BatchCreateJobSchema (agentJobs.dto.js) -
// one place (agents.service.js) processes the list sequentially because of
// the same DB pool limit.
export const BatchAgentDeploymentGroupSchema = z.object({
  agentIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
  groupName: z.string().trim().min(1).max(150),
});
