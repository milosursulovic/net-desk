import { z } from "zod";
import { isValidIPv4 } from "../utils/ip.js";

// Manager nema poseban inventory sync korak (za razliku od Agent-a) - ip je
// zato OBAVEZAN već pri enroll-u, jer je to jedini trenutak kad se razrešava
// ip_entry_id.
export const ManagerEnrollSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  managerVersion: z.string().max(50).nullable().optional(),
  ip: z.string().refine(isValidIPv4, { message: "Neispravan IPv4" }),
});

export const ManagerHeartbeatSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  managerVersion: z.string().max(50).nullable().optional(),
  // Živo, na svakom heartbeat-u ponovo prijavljeno stanje NetdeskAgent
  // servisa (ne Manager-ovo sopstveno stanje) - vidi managers.service.js.
  netdeskAgentServiceStatus: z.string().max(20).nullable().optional(),
  netdeskAgentStartMode: z.string().max(20).nullable().optional(),
});

export const MANAGER_COMMAND_TYPES = [
  "start_service",
  "stop_service",
  "restart_service",
  "set_service_start_mode",
  "install_update",
];

const MANAGER_SERVICE_COMMANDS = new Set(["start_service", "stop_service", "restart_service"]);

const ManagerJobCommandFields = z.object({
  commandType: z.enum(MANAGER_COMMAND_TYPES),
  payload: z.record(z.string(), z.any()).nullable().optional(),
});

// Isti "refine-chain" oblik kao agentJobs.dto.js's withCommandRefinements -
// serviceName NIJE obavezan u payload-u (default "NetdeskAgent" se popunjava
// server-side u createManagerJobService, ne ovde), zato nema refine za njega.
function withManagerCommandRefinements(schema) {
  return schema
    .refine(
      (data) =>
        data.commandType !== "set_service_start_mode" ||
        ["Automatic", "Manual", "Disabled"].includes(data.payload?.startMode),
      {
        message: "payload.startMode mora biti Automatic, Manual ili Disabled",
        path: ["payload", "startMode"],
      },
    )
    .refine(
      (data) =>
        data.commandType !== "install_update" ||
        (Number.isInteger(data.payload?.releaseId) && data.payload.releaseId > 0),
      {
        message: "payload.releaseId je obavezan za install_update",
        path: ["payload", "releaseId"],
      },
    );
}

export const CreateManagerJobSchema = withManagerCommandRefinements(ManagerJobCommandFields);

export const ManagerJobResultSchema = z.object({
  exitCode: z.coerce.number().int().nullable().optional(),
  output: z.string().nullable().optional(),
  errorOutput: z.string().nullable().optional(),
  durationMs: z.coerce.number().int().min(0).nullable().optional(),
  success: z.boolean().optional(),
});

export const ManagerJobListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  status: z
    .enum(["all", "pending", "sent", "completed", "failed", "cancelled"])
    .optional()
    .default("all"),
});

export { MANAGER_SERVICE_COMMANDS };
