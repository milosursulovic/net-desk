import { z } from "zod";

export const COMMAND_TYPES = [
  "restart_computer",
  "shutdown_computer",
  "logoff_user",
  "restart_service",
  "start_service",
  "stop_service",
  "run_powershell_script",
  "collect_inventory",
  "refresh_software_list",
  "delete_temp_files",
  // Kreira se programski (services/vncSessions.service.js), ne izlazi na
  // frontend "Nova komanda" dropdown ručnog biranja tipa komande.
  "start_vnc_bridge",
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
