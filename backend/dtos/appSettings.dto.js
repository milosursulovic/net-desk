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
    key: "vnc_webrtc_enabled",
    label: "WebRTC prikaz ekrana (BETA, pilot)",
    description:
      "Za agente koji prijave webrtc_capable tier (win10/win11/winsrv, net472 build) - pokušava WebRTC put " +
      "(capture+enkodiranje na samom agentu, bez UltraVNC-a) umesto RFB releja, sa automatskim padom nazad na RFB " +
      "ako WebRTC ne uspe. Podrazumevano isključeno - kill switch za Fazu 2 pilot rollout, ne dirati dok se ne " +
      "potvrdi na pilot deployment grupi.",
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
