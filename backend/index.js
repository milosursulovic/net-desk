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

dotenv.config();

const app = express();

// ---- Config & safety ----
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 5138;

const keyPath = process.env.SSL_KEY;
const certPath = process.env.SSL_CERT;

if (!keyPath || !certPath) {
  console.error("❌ SSL_KEY / SSL_CERT nisu postavljeni u .env");
  process.exit(1);
}
if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  console.error("❌ SSL fajlovi ne postoje na zadatim putanjama");
  process.exit(1);
}

const sslOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

// ---- Middlewares ----
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("combined"));
app.use(
  cors({
    origin: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(",")
      : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

// Blagi globalni limit (posebno ćemo limitirati i /login)
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use("/api/", apiLimiter);

// ---- DB ----
mongoose
  .connect(process.env.MONGO_URI, { autoIndex: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ---- Routes ----
app.use("/api/auth", authRoutes);
app.use("/api/protected", authenticateToken, protectedRoutes);

// ---- Global error handler ----
app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);
  res
    .status(err.status || 500)
    .json({ message: err.message || "Greška na serveru" });
});

// ---- HTTPS listen + graceful shutdown ----
const server = https.createServer(sslOptions, app).listen(PORT, HOST, () => {
  console.log(`🚀 Express HTTPS server running at https://${HOST}:${PORT}`);
});

const shutdown = () => {
  console.log("🛑 Shutting down...");
  server.close(() => {
    mongoose.connection.close(false, () => process.exit(0));
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
