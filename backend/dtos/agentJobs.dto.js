import { z } from "zod";

export const COMMAND_TYPES = [
  "restart_computer",
  "shutdown_computer",
  "logoff_user",
  "restart_service",
  "start_service",
  "stop_service",
  // Equivalent of restart_service/start_service/stop_service with
  // payload.serviceName="NetdeskAgent", but as an explicit, separate command
  // type (doesn't rely on string-matching the service name) - the agent
  // redirects to NetdeskAgentManager either way (see
  // AgentWorker.ProcessJobAsync), because NetdeskAgent must not (re)start
  // itself synchronously through JobExecutor.
  "start_netdesk_agent",
  "stop_netdesk_agent",
  "restart_netdesk_agent",
  "run_powershell_script",
  "collect_inventory",
  "refresh_software_list",
  "delete_temp_files",
  // Created programmatically (services/vncSessions.service.js), not offered in
  // the frontend "New command" dropdown for manually picking a command type.
  "start_vnc_bridge",
  // Created programmatically from AgentReleasesView.vue's "Force
  // reinstall" button (payload pre-filled from the selected release), same
  // as start_vnc_bridge - not offered in the generic dropdown for manually
  // picking a command type.
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
    // When true, agents that aren't currently "online" (same definition as
    // computeConnectivityStatus in agents.service.js) are skipped instead of
    // being sent a command they may not pick up for a long time.
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
