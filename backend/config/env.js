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
// Raised from the historical 10 - with more agents (more concurrent
// inventory sync/heartbeat requests), 10 shared connections had become a
// bottleneck (requests queuing for a connection) even though MariaDB itself
// had huge unused capacity (max_connections defaults to 151, the process
// CPU well under 100%). See backend/db/pool.js.
export const DB_CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT ?? 30);

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export const AGENT_ENROLL_TOKEN = requireEnv("AGENT_ENROLL_TOKEN");

// Deliberately a SEPARATE secret from AGENT_ENROLL_TOKEN - a Manager
// identity is a more dangerous primitive per enrollment (start/stop/restart
// ANY service by name, replacing files under an install dir it resolves
// itself), so leaking one token must not allow minting the other identity.
export const MANAGER_ENROLL_TOKEN = requireEnv("MANAGER_ENROLL_TOKEN");

// Optional - if unset, release packages are not signed (the spec mentions
// this as a "possibility", not a requirement). See utils/agentSigning.js.
export const AGENT_SIGNING_CERT_PATH = process.env.AGENT_SIGNING_CERT_PATH || null;
export const AGENT_SIGNING_KEY_PATH = process.env.AGENT_SIGNING_KEY_PATH || null;

export const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Optional - if unset, push notifications are disabled (the subscribe
// endpoint still exists, but the watcher sends nothing). See utils/webPush.js.
export const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || null;

// Optional - shared UltraVNC password (the same one set in ultravnc.ini on
// every managed machine). If unset, the frontend attempts the VNC
// connection without a password (works if UltraVNC is configured not to
// require one for loopback connections). See services/vncSessions.service.js.
export const VNC_SHARED_PASSWORD = process.env.VNC_SHARED_PASSWORD || "";
