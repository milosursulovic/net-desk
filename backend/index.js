// server.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";
import https from "https";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.js";
import protectedRoutes from "./routes/protected.js";
import { authenticateToken } from "./middlewares/auth.js";
import { startPingLoop } from "./services/pingService.js";

dotenv.config();

/* ----------------------------- Config helpers ----------------------------- */
const requireEnv = (key, fallback = undefined) => {
  const val = process.env[key] ?? fallback;
  if (val === undefined || val === "") {
    console.error(`❌ Missing required env: ${key}`);
    process.exit(1);
  }
  return val;
};

const IS_PROD = process.env.NODE_ENV === "production";
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT ?? 5138);
const MONGO_URI = requireEnv("MONGO_URI");
const SSL_KEY = requireEnv("SSL_KEY");
const SSL_CERT = requireEnv("SSL_CERT");

/** Parse comma-separated list to array or return true to allow all in dev */
const parseAllowedOrigins = (val) => {
  if (!val || val.trim() === "") return !IS_PROD ? true : [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

if (!fs.existsSync(SSL_KEY) || !fs.existsSync(SSL_CERT)) {
  console.error("❌ SSL files don't exist at provided paths");
  process.exit(1);
}

const sslOptions = {
  key: fs.readFileSync(SSL_KEY),
  cert: fs.readFileSync(SSL_CERT),
};

/* ---------------------------------- App ---------------------------------- */
const app = express();
app.set("trust proxy", 1); // required if behind reverse proxy / load balancer

/* -------------------------------- Security -------------------------------- */
app.use(
  helmet({
    crossOriginResourcePolicy: false, // allow serving images to other origins if needed
    hsts: IS_PROD, // send HSTS only in production
  })
);

/* -------------------------------- Logging -------------------------------- */
app.use(
  morgan("combined", {
    skip: (req) => req.url === "/health" || req.url === "/ready",
  })
);

/* --------------------------------- CORS ---------------------------------- */
app.use(
  cors({
    origin: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
    credentials: true,
  })
);

/* ------------------------------ Body parsing ------------------------------ */
app.use(express.json({ limit: "2mb" }));

/* ------------------------------- Rate limits ------------------------------ */
// Gentle global API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", apiLimiter);

// Stricter limiter for auth (useful for /login, /refresh, etc.)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth/", authLimiter);

/* ----------------------------- Liveness/Ready ----------------------------- */
let isDbReady = false;

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/ready", (_req, res) =>
  isDbReady ? res.status(200).send("ready") : res.status(503).send("not ready")
);

/* --------------------------------- Routes -------------------------------- */
app.use("/api/auth", authRoutes);
app.use("/api/protected", authenticateToken, protectedRoutes);

/* ----------------------------- 404 (not found) ---------------------------- */
app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/ready") return next();
  res.status(404).json({ message: "Ruta nije pronađena" });
});

/* --------------------------- Global error handler ------------------------- */
app.use((err, _req, res, _next) => {
  // express.json syntax errors land here as well
  console.error("❌ Unhandled error:", err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Greška na serveru" });
});

/* ------------------------------- Start/Stop ------------------------------- */
const server = https.createServer(sslOptions, app);

const connectMongo = async () => {
  try {
    await mongoose.connect(MONGO_URI, { autoIndex: true });
    isDbReady = true;
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

const start = async () => {
  await connectMongo();

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Express HTTPS server running at https://${HOST}:${PORT}`);
  });

  // Start background jobs after successful startup
  startPingLoop(30);
};

const shutdown = async (signal) => {
  console.log(`🛑 Received ${signal}. Shutting down...`);

  // Close HTTP server gracefully
  await new Promise((resolve) => server.close(resolve));

  // Close DB (no force, allow existing ops to finish)
  await mongoose.connection.close(false);

  console.log("✅ Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Safety nets
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  // Best-effort shutdown, but exit non-zero
  shutdown("uncaughtException").finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  shutdown("unhandledRejection").finally(() => process.exit(1));
});

start();
