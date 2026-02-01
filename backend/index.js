import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import https from "https";
import helmet from "helmet";
import morgan from "morgan";
import mysql from "mysql2/promise";

import authRoutes from "./routes/auth.js";
import protectedRoutes from "./routes/protected.js";
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

const SSL_KEY = requireEnv("SSL_KEY");
const SSL_CERT = requireEnv("SSL_CERT");

const DB_HOST = requireEnv("DB_HOST");
const DB_PORT = Number(process.env.DB_PORT ?? 3306);
const DB_USER = requireEnv("DB_USER");
const DB_PASS = requireEnv("DB_PASS");
const DB_NAME = requireEnv("DB_NAME");

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

const allowedOrigins = (() => {
  const v = process.env.CORS_ALLOWED_ORIGINS || "";
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
})();

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      if (!IS_PROD && allowedOrigins.length === 0) return cb(null, true);

      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options(/.*/, cors());
app.use(express.json({ limit: "2mb" }));

let isDbReady = false;

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4_general_ci",
});

export { pool };

app.get("/health", (_req, res) => res.status(200).send("ok"));
app.get("/ready", (_req, res) =>
  isDbReady ? res.status(200).send("ready") : res.status(503).send("not ready")
);

app.use("/api/auth", authRoutes);
app.use("/api/protected", authenticateToken, protectedRoutes);

app.use((req, res, next) => {
  if (req.path === "/health" || req.path === "/ready") return next();
  res.status(404).json({ message: "Ruta nije pronađena" });
});

app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err);
  res.status(err.status || 500).json({ message: err.message || "Greška na serveru" });
});

const server = https.createServer(sslOptions, app);

const connectMySql = async () => {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
    isDbReady = true;
    console.log("✅ MySQL connected");
  } catch (err) {
    console.error("❌ MySQL connection error:", err?.message || err);
    process.exit(1);
  }
};

const start = async () => {
  await connectMySql();

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Express HTTPS server running at https://${HOST}:${PORT}`);
  });

  startPingLoop(30);
};

const shutdown = async (signal) => {
  console.log(`🛑 Received ${signal}. Shutting down...`);

  await new Promise((resolve) => server.close(resolve));

  try {
    await pool.end();
  } catch (e) {
    console.error("❌ Error closing MySQL pool:", e?.message || e);
  }

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

