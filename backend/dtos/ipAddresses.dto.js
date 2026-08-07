import { z } from "zod";
import { isValidIPv4 } from "../utils/ip.js";

// Dve fizičke lokacije - Bolnica (10.230.62.0/23) i Dom zdravlja
// (10.160.64.0/21). Lokacija se NAMERNO uvek bira ručno (dropdown), nikad
// ne izvodi automatski iz IP opsega, iako se opsezi ne preklapaju -
// korisnikova eksplicitna odluka pri planiranju ovog feature-a.
export const SITES = ["bolnica", "dom_zdravlja"];

// Poznati/prepoznati remote-access alati (agents.service.js's detectRdpApps
// ih traži po imenu servisa) - ip_entries.rdp_app čuva SPOJEN string labela
// (npr. "AnyDesk, TeamViewer", jedan računar može imati i do sve četiri),
// pa filter na listi treba da poredi PO POJEDINAČNOJ labeli (contains-match,
// ne exact-equals) - vidi listIpEntries's "rdp_app LIKE" filter. Ovde živi
// (ne u agents.service.js) jer je rdp_app ip_entries kolona - jedan izvor
// istine za i detekciju i filter-options predloge.
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
  department: z.string().optional(),
  os: z.string().optional(),
  osArchitecture: z.string().optional(),
  rdpApp: z.string().optional(),
  site: z.enum(SITES).optional(),
  // z.coerce.boolean() bi tretiralo BILO KOJI neprazan string (i "0"/"false")
  // kao true - query string uvek stiže kao string, pa se namerno poredi sa
  // eksplicitnom listom "istinitih" vrednosti umesto toga.
  pendingRepack: z
    .string()
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

export const PendingRepackSchema = z.object({
  pendingRepack: z.boolean(),
});
