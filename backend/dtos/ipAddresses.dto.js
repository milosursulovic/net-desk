import { z } from "zod";
import { isValidIPv4 } from "../utils/ip.js";

// Two physical sites - Bolnica (10.230.62.0/23) and Dom zdravlja
// (10.160.64.0/21). The site is DELIBERATELY always picked manually (dropdown),
// never derived from the IP range, even though the ranges don't overlap -
// the user's explicit decision when this feature was planned.
export const SITES = ["bolnica", "dom_zdravlja"];

// Known/recognized remote-access tools (agents.service.js's detectRdpApps
// looks them up by service name) - ip_entries.rdp_app stores a JOINED string of
// labels (e.g. "AnyDesk, TeamViewer"; one computer can have all four), so the
// list filter must compare PER INDIVIDUAL label (contains-match, not
// exact-equals) - see listIpEntries's "rdp_app LIKE" filter. It lives here
// (not in agents.service.js) because rdp_app is an ip_entries column - a single
// source of truth for both detection and the filter-options suggestions.
export const RDP_APP_PATTERNS = [
  { label: "AnyDesk", patterns: ["anydesk"] },
  { label: "TeamViewer", patterns: ["teamviewer"] },
  { label: "UltraVNC", patterns: ["uvnc", "ultravnc", "winvnc"] },
  { label: "VNC Server", patterns: ["vncserver", "realvnc"] },
];

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

export const EntryTypeEnum = z.enum(["computer", "device"]);

export const UpsertIpSchema = z.object({
  ip: z.string().refine(isValidIPv4, "Neispravan IPv4"),
  computerName: z.string().nullable().optional(),
  rdpApp: z.string().nullable().optional(),
  os: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  site: z.enum(SITES),
  description: z.string().nullable().optional(),
  entryType: EntryTypeEnum.nullable().optional(),
});

// The department/os/rdpApp filters are now multiselects on the frontend -
// the same key URLSearchParams.append-ed several times reaches Express as an
// array (qs-style parsing), but EXACTLY ONE value arrives as a bare string, not
// a one-element array - z.union accepts both shapes, the transform always
// normalizes them to an array (empty when the filter wasn't sent at all) so the
// repo/service layer never has to branch on "is this a string or an array".
const multiValueFilter = () =>
  z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]));

export const ListSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(1000).default(10),
  sortBy: z
    .enum(["ip", "computerName", "rdpApp", "os", "department", "description"])
    .optional()
    .default("ip"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  status: z.enum(["all", "online", "offline"]).optional().default("all"),
  entryType: z
    .enum(["all", "computer", "device", "unknown"])
    .optional()
    .default("all"),
  department: multiValueFilter(),
  os: multiValueFilter(),
  osArchitecture: z.string().optional(),
  rdpApp: multiValueFilter(),
  site: z.enum(SITES).optional(),
  // Same pattern as pendingRepack below - the query string always arrives as a
  // string, so it's compared explicitly against "truthy" values instead of
  // z.coerce.boolean() (which would treat "0"/"false" as true too).
  // Filters for machines WITHOUT the Izvolte folder (not those with it) - that's
  // the actionable state for the admin (that machine needs fixing), unlike "has
  // it", which needs no action.
  missingIzvolteFolder: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
  // z.coerce.boolean() would treat ANY non-empty string (including "0"/"false")
  // as true - the query string always arrives as a string, so it's deliberately
  // compared against an explicit list of "truthy" values instead.
  pendingRepack: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const PendingRepackSchema = z.object({
  pendingRepack: z.boolean(),
});
