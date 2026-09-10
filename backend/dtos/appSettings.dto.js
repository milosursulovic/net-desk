import { z } from "zod";

// Registry svih poznatih podešavanja - dodaj ovde kad god treba novi
// checkbox na Config strani, ostalo (repo/service/controller/frontend
// lista) je generičko i automatski ga podigne.
export const APP_SETTINGS = [
  {
    key: "vnc_enabled",
    label: "Udaljena kontrola ekrana (VNC)",
    description:
      "Omogućava 'Uzmi kontrolu ekrana' na stranici agenta (zahteva UltraVNC instaliran na upravljanoj mašini).",
    type: "boolean",
    default: "false",
  },
  {
    key: "process_monitor_enabled",
    label: "Ubijanje sumnjivih procesa",
    description:
      "Globalni prekidač za automatsko ubijanje watchlist procesa (AnyDesk, TeamViewer i sl.) na svim agentima. " +
      "Detekcija i dalje radi (vidljivo na 'Sumnjivi procesi') dok je isključeno - samo se ništa ne ubija, kao da su " +
      "svi agenti privremeno na whitelisti. Podrazumevano uključeno da ne bi nadogradnja app-a tiho ugasila " +
      "postojeću zaštitu.",
    type: "boolean",
    default: "true",
  },
  {
    key: "app_language",
    label: "Jezik aplikacije",
    description: "Jezik korisničkog interfejsa za sve korisnike, uključujući ekran za prijavu.",
    type: "select",
    options: [
      { value: "sr", label: "Srpski", flag: "🇷🇸" },
      { value: "en", label: "English", flag: "🇬🇧" },
    ],
    default: "sr",
  },
];

export const SETTING_KEYS = APP_SETTINGS.map((s) => s.key);
const SETTINGS_BY_KEY = new Map(APP_SETTINGS.map((s) => [s.key, s]));

// z.enum() throws at module-load time if given an empty array, so an empty
// registry needs a schema that still parses (and correctly rejects every
// key, since none are valid yet) rather than crashing the whole app on
// startup.
export const UpdateSettingSchema = z
  .object({
    key: SETTING_KEYS.length ? z.enum(SETTING_KEYS) : z.never(),
    value: z.union([z.boolean(), z.string()]),
  })
  .superRefine((data, ctx) => {
    const def = SETTINGS_BY_KEY.get(data.key);
    if (!def) return; // unknown key - caught elsewhere (service throws 404)

    if (def.type === "boolean" && typeof data.value !== "boolean") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Vrednost mora biti boolean" });
    }
    if (def.type === "select") {
      const allowed = def.options.map((o) => o.value);
      if (typeof data.value !== "string" || !allowed.includes(data.value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Nepoznata vrednost" });
      }
    }
  });
