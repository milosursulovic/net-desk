import { z } from "zod";

export const COMMAND_TYPES = [
  "restart_computer",
  "shutdown_computer",
  "logoff_user",
  "restart_service",
  "start_service",
  "stop_service",
  // Ekvivalent restart_service/start_service/stop_service sa
  // payload.serviceName="NetdeskAgent", ali kao eksplicitan, odvojen tip
  // komande (ne oslanja se na string-poklapanje imena servisa) - agent i
  // ovako i onako preusmerava na NetdeskAgentManager (videti
  // AgentWorker.ProcessJobAsync), jer NetdeskAgent ne sme sam sebe da
  // (re)startuje sinhrono kroz JobExecutor.
  "start_netdesk_agent",
  "stop_netdesk_agent",
  "restart_netdesk_agent",
  "run_powershell_script",
  "collect_inventory",
  "refresh_software_list",
  "delete_temp_files",
  // Kreira se programski (services/vncSessions.service.js), ne izlazi na
  // frontend "Nova komanda" dropdown ručnog biranja tipa komande.
  "start_vnc_bridge",
  // Kreira se programski iz AgentReleasesView.vue-ovog "Forsiraj
  // reinstalaciju" dugmeta (payload već popunjen iz izabranog release-a),
  // isto kao start_vnc_bridge - ne izlazi na generički dropdown ručnog
  // biranja tipa komande.
  "force_reinstall_agent",
];

const SERVICE_COMMANDS = new Set([
  "restart_service",
  "start_service",
  "stop_service",
]);

const JobCommandFields = z.object({
  commandType: z.enum(COMMAND_TYPES),
  payload: z.record(z.string(), z.any()).nullable().optional(),
});

// Shared by CreateJobSchema and BatchCreateJobSchema so the two can't drift -
// same commandType/payload rules regardless of how many agents it targets.
function withCommandRefinements(schema) {
  return schema
    .refine(
      (data) =>
        !SERVICE_COMMANDS.has(data.commandType) ||
        (typeof data.payload?.serviceName === "string" &&
          data.payload.serviceName.trim() !== ""),
      {
        message: "payload.serviceName je obavezan za ovu komandu",
        path: ["payload", "serviceName"],
      },
    )
    .refine(
      (data) =>
        data.commandType !== "run_powershell_script" ||
        (typeof data.payload?.script === "string" &&
          data.payload.script.trim() !== ""),
      {
        message: "payload.script je obavezan za run_powershell_script",
        path: ["payload", "script"],
      },
    )
    .refine(
      (data) =>
        data.commandType !== "force_reinstall_agent" ||
        (Number.isInteger(data.payload?.releaseId) && data.payload.releaseId > 0),
      {
        message: "payload.releaseId je obavezan za force_reinstall_agent",
        path: ["payload", "releaseId"],
      },
    )
    .refine(
      (data) =>
        data.commandType !== "force_reinstall_agent" ||
        (typeof data.payload?.version === "string" && data.payload.version.trim() !== ""),
      {
        message: "payload.version je obavezan za force_reinstall_agent",
        path: ["payload", "version"],
      },
    )
    .refine(
      (data) =>
        data.commandType !== "force_reinstall_agent" ||
        (typeof data.payload?.sha256 === "string" && data.payload.sha256.trim() !== ""),
      {
        message: "payload.sha256 je obavezan za force_reinstall_agent",
        path: ["payload", "sha256"],
      },
    );
}

export const CreateJobSchema = withCommandRefinements(JobCommandFields);

export const BatchCreateJobSchema = withCommandRefinements(
  JobCommandFields.extend({
    agentIds: z.array(z.coerce.number().int().positive()).min(1).max(500),
    // Kad je true, agenti koji trenutno nisu "online" (ista definicija kao
    // computeConnectivityStatus u agents.service.js) se preskaču umesto da
    // im se pošalje komanda koju možda neće pokupiti još dugo.
    onlyOnline: z.boolean().optional().default(false),
  }),
);

export const JobResultSchema = z.object({
  exitCode: z.coerce.number().int().nullable().optional(),
  output: z.string().nullable().optional(),
  errorOutput: z.string().nullable().optional(),
  durationMs: z.coerce.number().int().min(0).nullable().optional(),
  success: z.boolean().optional(),
});

export const JobListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  status: z
    .enum(["all", "pending", "sent", "completed", "failed", "cancelled"])
    .optional()
    .default("all"),
});
