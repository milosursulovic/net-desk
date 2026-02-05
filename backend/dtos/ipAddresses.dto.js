import { z } from "zod";
import { isValidIPv4 } from "../utils/ip.js";

export const ScanSchema = z.object({
  ip: z.string().refine(isValidIPv4, { message: "Neispravan IPv4" }),
  ports: z.string().optional(),
  timeoutMs: z.coerce
    .number()
    .int()
    .min(100)
    .max(20000)
    .optional()
    .default(100),
  concurrency: z.coerce.number().int().min(1).max(1024).optional().default(64),
});

export const UpsertIpSchema = z.object({
  ip: z.string().refine(isValidIPv4, "Neispravan IPv4"),
  computerName: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  fullName: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  rdp: z.string().nullable().optional(),
  rdpApp: z.string().nullable().optional(),
  os: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  heliantInstalled: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const ListSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(10),
  sortBy: z
    .enum([
      "ip",
      "computerName",
      "username",
      "fullName",
      "rdp",
      "rdpApp",
      "os",
      "department",
      "heliantInstalled",
      "description",
    ])
    .optional()
    .default("ip"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  status: z.enum(["all", "online", "offline"]).optional().default("all"),
});
