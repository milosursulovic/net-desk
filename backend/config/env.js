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

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

export const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
