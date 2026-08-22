import dotenv from "dotenv";
import { requireEnv } from "../utils/env.js";

dotenv.config();

export const IS_PROD = process.env.NODE_ENV === "production";
export const HOST = process.env.HOST || "0.0.0.0";
export const PORT = Number(process.env.PORT ?? 5138);

export const SSL_KEY = requireEnv("SSL_KEY");
export const SSL_CERT = requireEnv("SSL_CERT");

export const DB_HOST = requireEnv("DB_HOST");
export const DB_PORT = Number(process.env.DB_PORT ?? 3306);
export const DB_USER = requireEnv("DB_USER");
export const DB_PASS = requireEnv("DB_PASS");
export const DB_NAME = requireEnv("DB_NAME");
// Podignuto sa istorijskih 10 - uz veći broj agenata (više paralelnih
// inventory sync/heartbeat zahteva), 10 deljenih konekcija je postajalo
// usko grlo (zahtevi čekaju red za konekciju) i pored toga što je sama
// MariaDB imala ogroman neiskorišćen kapacitet (max_connections podrazumevano
// 151, CPU proces daleko ispod 100%). Vidi backend/db/pool.js.
export const DB_CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT ?? 30);

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export const AGENT_ENROLL_TOKEN = requireEnv("AGENT_ENROLL_TOKEN");

// Namerno ODVOJEN secret od AGENT_ENROLL_TOKEN - Manager identitet je
// opasniji primitiv po enrollment-u (start/stop/restart BILO KOG servisa po
// imenu, zamena fajlova pod install dir-om koji sam razrešava), curenje
// jednog tokena ne sme da omogući mint drugog identiteta.
export const MANAGER_ENROLL_TOKEN = requireEnv("MANAGER_ENROLL_TOKEN");

// Opciono - ako nisu podešeni, release paketi se ne potpisuju (spec ovo
// pominje kao "mogućnost", ne obavezu). Videti utils/agentSigning.js.
export const AGENT_SIGNING_CERT_PATH = process.env.AGENT_SIGNING_CERT_PATH || null;
export const AGENT_SIGNING_KEY_PATH = process.env.AGENT_SIGNING_KEY_PATH || null;

export const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Opciono - ako nisu podešeni, push notifikacije su isključene (subscribe
// endpoint i dalje postoji, ali watcher ne šalje ništa). Videti utils/webPush.js.
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || null;

// Opciono - deljena UltraVNC lozinka (ista podešena u ultravnc.ini na
// svakoj upravljanoj mašini). Ako nije podešena, frontend pokušava VNC
// konekciju bez lozinke (radi ako je UltraVNC konfigurisan da je ne
// zahteva za loopback konekcije). Videti services/vncSessions.service.js.
export const VNC_SHARED_PASSWORD = process.env.VNC_SHARED_PASSWORD || "";
