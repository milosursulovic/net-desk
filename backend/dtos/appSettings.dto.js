import { z } from "zod";

// Registry svih poznatih podešavanja - dodaj ovde kad god treba novi
// checkbox na Config strani, ostalo (repo/service/controller/frontend
// lista) je generičko i automatski ga podigne.
export const APP_SETTINGS = [
  {
    key: "vnc_enabled",
    label: "Omogući VNC (remote screen control) — BETA",
    description:
      "Kad je isključeno, 'Uzmi kontrolu ekrana' na strani agenta je blokirano bez obzira na rolu. " +
      "Nije još potvrđeno uživo na pravoj mašini (videti docs/TECHNICAL.md, sekcija Remote screen control).",
    type: "boolean",
    default: "false",
  },
];

export const SETTING_KEYS = APP_SETTINGS.map((s) => s.key);

export const UpdateSettingSchema = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.boolean(),
});
