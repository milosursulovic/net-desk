import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import fs from "fs";
import https from "https";
import helmet from "helmet";
import morgan from "morgan";

import authRoutes from "./routes/auth.js";
import protectedRoutes from "./routes/protected.js";
import domainsRoutes from "./routes/domains.js";
import { authenticateToken } from "./middlewares/auth.js";
import { startPingLoop } from "./services/pingService.js";

dotenv.config();

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

const app = express();

app.set("trust proxy", true);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    hsts: IS_PROD,
  })
);

app.use(
  morgan("combined", {
    skip: (req) => req.url === "/health" || req.url === "/ready",
  })
);

app.use(
  cors({
    origin: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

let isDbReady = false;

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/ready", (_req, res) =>
  isDbReady ? res.status(200).send("ready") : res.status(503).send("not ready")
);

app.use("/api/auth", authRoutes);
app.use("/api/protected", authenticateToken, protectedRoutes);
app.use("/api/domains", domainsRoutes);

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/ready") return next();
  res.status(404).json({ message: "Ruta nije pronađena" });
});

app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Greška na serveru" });
});

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

  startPingLoop(30);
};

const shutdown = async (signal) => {
  console.log(`🛑 Received ${signal}. Shutting down...`);

  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close(false);

  console.log("✅ Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  shutdown("uncaughtException").finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  shutdown("unhandledRejection").finally(() => process.exit(1));
});

start();
