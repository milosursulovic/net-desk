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
];

export const SETTING_KEYS = APP_SETTINGS.map((s) => s.key);

// z.enum() throws at module-load time if given an empty array, so an empty
// registry needs a schema that still parses (and correctly rejects every
// key, since none are valid yet) rather than crashing the whole app on
// startup.
export const UpdateSettingSchema = z.object({
  key: SETTING_KEYS.length ? z.enum(SETTING_KEYS) : z.never(),
  value: z.boolean(),
});
