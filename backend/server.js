import https from "https";
import { createApp } from "./app.js";
import { getSslOptions } from "./config/ssl.js";
import { HOST, PORT } from "./config/env.js";
import { pool } from "./db/pool.js";
import { startPingLoop } from "./utils/pingService.js";
import { startPushNotificationWatcher } from "./utils/pushNotificationWatcher.js";

const connectMySql = async () => {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query("SELECT 1");
    } finally {
      conn.release();
    }
    console.log("✅ MySQL connected");
    return true;
  } catch (err) {
    console.error("❌ MySQL connection error:", err?.message || err);
    return false;
  }
};

export const startServer = async () => {
  const app = createApp();
  const sslOptions = getSslOptions();
  const server = https.createServer(sslOptions, app);

  const ok = await connectMySql();
  if (!ok) process.exit(1);

  app.locals.isDbReady = true;

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Express HTTPS server running at https://${HOST}:${PORT}`);
  });

  startPingLoop(30);
  startPushNotificationWatcher(60);

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
};

startServer();
