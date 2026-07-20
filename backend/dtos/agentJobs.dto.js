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
];

const SERVICE_COMMANDS = new Set([
  "restart_service",
  "start_service",
  "stop_service",
]);

export const CreateJobSchema = z
  .object({
    commandType: z.enum(COMMAND_TYPES),
    payload: z.record(z.string(), z.any()).nullable().optional(),
  })
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
    .enum(["all", "pending", "sent", "completed", "failed"])
    .optional()
    .default("all"),
});
