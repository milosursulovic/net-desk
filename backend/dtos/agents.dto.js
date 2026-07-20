import { z } from "zod";
import { isValidIPv4 } from "../utils/ip.js";

export const EnrollSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  osCaption: z.string().max(255).nullable().optional(),
  osVersion: z.string().max(100).nullable().optional(),
  osBuild: z.string().max(50).nullable().optional(),
  agentVersion: z.string().max(50).nullable().optional(),
});

export const MonitoringSchema = z.object({
  cpuLoadPct: z.coerce.number().min(0).max(100).nullable().optional(),
  ramLoadPct: z.coerce.number().min(0).max(100).nullable().optional(),
  diskUsedPct: z.coerce.number().min(0).max(100).nullable().optional(),
  diskFreeGb: z.coerce.number().min(0).nullable().optional(),
  networkConnected: z.boolean().nullable().optional(),
  antivirusStatus: z.string().max(50).nullable().optional(),
  firewallStatus: z.string().max(50).nullable().optional(),
  bitlockerStatus: z.string().max(50).nullable().optional(),
  temperatureC: z.coerce.number().nullable().optional(),
});

export const HeartbeatSchema = z.object({
  hostname: z.string().max(255).nullable().optional(),
  agentVersion: z.string().max(50).nullable().optional(),
  uptimeSeconds: z.coerce.number().int().min(0).nullable().optional(),
  monitoring: MonitoringSchema.nullable().optional(),
});

// OS/System/Motherboard/BIOS/CPU/RAMModules/Storage/GPUs/NICs su namerno
// nevalidirani ovde - upsertMetadataForIpEntry (metadata.service.js) ih
// tolerantno parsira (pick po Pascal/camelCase), isto kao postojeći
// /ip-addresses/:ip/metadata upsert flow.
export const InventorySyncSchema = z
  .object({
    ip: z.string().refine(isValidIPv4, { message: "Neispravan IPv4" }),
    hostname: z.string().max(150).nullable().optional(),
    department: z.string().max(150).nullable().optional(),
    software: z.array(z.record(z.string(), z.any())).optional(),
    drivers: z.array(z.record(z.string(), z.any())).optional(),
    services: z.array(z.record(z.string(), z.any())).optional(),
    updates: z.array(z.record(z.string(), z.any())).optional(),
    printers: z.array(z.record(z.string(), z.any())).optional(),
    availableUpdates: z.array(z.record(z.string(), z.any())).optional(),
    eventLogs: z.array(z.record(z.string(), z.any())).optional(),
  })
  .passthrough();
