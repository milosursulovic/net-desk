import { z } from "zod";

// Klasične osnovne vrednosti sada žive u deployment_groups_list (seed-ovane
// u migraciji 0006_deployment_groups_multi.sql), ne kao konstanta ovde -
// deployment grupe su odvojena lista od odeljenja (groups_list).
const DeploymentGroupValue = z.string().trim().min(1).max(150);

// 100 (ne 20) - čisto sanity ceiling, ne poslovno pravilo. Organizacija ima
// već 49 stvarnih odeljenja preko obe lokacije (deployment grupe su sad
// usklađene sa odeljenjima, ne fiksna 4-vrednosna lista), pa je 20 bilo
// stvarno dostižno i blokiralo je legitiman rollout na sva odeljenja.
const MAX_DEPLOYMENT_GROUPS = 100;

export const CreateReleaseSchema = z.object({
  version: z.string().min(1).max(50),
  // Release sada cilja VIŠE grupa odjednom (agent_release_groups tabela) -
  // ne jednu skalarnu vrednost kao ranije.
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(MAX_DEPLOYMENT_GROUPS),
  releaseNotes: z.string().nullable().optional(),
  // Koji .NET Framework/csproj target je ovaj paket - net452 (RFB-only,
  // Win7-kompatibilno) ili net472 (RFB+WebRTC, vidi plan dual-path VNC-a).
  // Default net452 čuva postojeći single-tier upload tok bez izmena na
  // frontend-u dok se Faza 2 ne uradi.
  targetRuntime: z.enum(["net452", "net472"]).default("net452"),
});

export const UpdateReportSchema = z.object({
  fromVersion: z.string().max(50).nullable().optional(),
  toVersion: z.string().max(50).nullable().optional(),
  success: z.boolean(),
  reason: z.string().nullable().optional(),
});

// Za "širenje" rollout-a - menja SET ciljanih grupa na već otpremljenom
// release-u (pun replace, ne append - frontend šalje stari set + nove
// grupe da bi "proširio", ili manji set da bi suzio).
export const UpdateReleaseGroupsSchema = z.object({
  deploymentGroups: z.array(DeploymentGroupValue).min(1).max(MAX_DEPLOYMENT_GROUPS),
});
