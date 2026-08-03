import { z } from "zod";

// Više NIJE stroga validaciona lista - deployment grupe su sada slobodan
// tekst (usklađeno sa stvarnim odeljenjima organizacije, ne generičkim
// nazivima). Ova konstanta ostaje samo kao "klasične" osnovne predloge u
// UI-ju (agentFilterOptionsService ih dodaje u listu predloga pored
// odeljenja koja već postoje).
export const DEPLOYMENT_GROUPS = ["test", "it", "pilot", "rest"];

const DeploymentGroupValue = z.string().trim().min(1).max(150);

export const CreateReleaseSchema = z.object({
  version: z.string().min(1).max(50),
  // Release sada cilja VIŠE grupa odjednom (agent_release_groups tabela) -
  // ne jednu skalarnu vrednost kao ranije.
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(20),
  releaseNotes: z.string().nullable().optional(),
});

export const UpdateReportSchema = z.object({
  fromVersion: z.string().max(50).nullable().optional(),
  toVersion: z.string().max(50).nullable().optional(),
  success: z.boolean(),
  reason: z.string().nullable().optional(),
});

export const DeploymentGroupSchema = z.object({
  deploymentGroup: DeploymentGroupValue,
});

// Za "širenje" rollout-a - menja SET ciljanih grupa na već otpremljenom
// release-u (pun replace, ne append - frontend šalje stari set + nove
// grupe da bi "proširio", ili manji set da bi suzio).
export const UpdateReleaseGroupsSchema = z.object({
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(20),
});
