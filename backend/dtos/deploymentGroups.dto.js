import { z } from "zod";

export const CreateDeploymentGroupSchema = z.object({
  name: z.string().trim().min(1).max(150),
});

export const AgentDeploymentGroupSchema = z.object({
  groupName: z.string().trim().min(1).max(150),
});

// Isti agentIds oblik/limit kao BatchCreateJobSchema (agentJobs.dto.js) -
// jedno mesto (agents.service.js) obrađuje listu sekvencijalno zbog istog
// DB pool ograničenja.
export const BatchAgentDeploymentGroupSchema = z.object({
  agentIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
  groupName: z.string().trim().min(1).max(150),
});
