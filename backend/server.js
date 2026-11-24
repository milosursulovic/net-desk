import https from "https";
import { createApp } from "./app.js";
import { getSslOptions } from "./config/ssl.js";
import { HOST, PORT } from "./config/env.js";
import { pool } from "./db/pool.js";
import { startPingLoop } from "./utils/pingService.js";
import { startPushNotificationWatcher } from "./utils/pushNotificationWatcher.js";
import { startDailyReportScheduler } from "./utils/dailyReportScheduler.js";
import { startServerHealthSnapshotLoop } from "./utils/serverHealthScheduler.js";
import { startDomainBlacklistSyncLoop } from "./utils/domainBlacklistScheduler.js";
import { attachVncRelay } from "./ws/vncRelay.js";
import { attachFileTransferRelay } from "./ws/fileTransferRelay.js";

// How long in-flight requests get to finish before lingering sockets are destroyed.
const SHUTDOWN_GRACE_MS = 5_000;
const SHUTDOWN_FORCE_EXIT_MS = 15_000;

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

  // Agents hold keep-alive HTTPS and WebSocket connections that never close on
  // their own, so server.close() alone never finishes. "connection" yields the
  // raw TCP socket - destroying it also ends the TLS session and any WebSocket on it.
  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  attachVncRelay(server);
  attachFileTransferRelay(server);

  const ok = await connectMySql();
  if (!ok) process.exit(1);

  app.locals.isDbReady = true;

  server.listen(PORT, HOST, () => {
    console.log(`🚀 Express HTTPS server running at https://${HOST}:${PORT}`);
  });

  const loops = [
    startPingLoop(30),
    startPushNotificationWatcher(60),
    startDailyReportScheduler(7),
    startServerHealthSnapshotLoop(120),
    startDomainBlacklistSyncLoop(24),
  ];

  let shutdownPromise = null;
  // Exit code is the caller's choice (signal -> 0, crash -> 1); a second call
  // (e.g. another signal mid-shutdown) just gets the same promise.
  const shutdown = (reason) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      console.log(`🛑 Received ${reason}. Shutting down...`);

      // Last resort if a step below hangs (e.g. pool.end()) - must stay well
      // under systemd's TimeoutStopSec (90s), which would SIGKILL us instead.
      setTimeout(() => {
        console.error("❌ Shutdown timed out, forcing exit");
        process.exit(1);
      }, SHUTDOWN_FORCE_EXIT_MS).unref();

      for (const loop of loops) {
        try {
          loop?.stop();
        } catch (e) {
          console.error("❌ Error stopping background loop:", e?.message || e);
        }
      }

      const closed = new Promise((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      const graceTimer = setTimeout(() => {
        for (const socket of sockets) socket.destroy();
      }, SHUTDOWN_GRACE_MS);
      await closed;
      clearTimeout(graceTimer);

      try {
        await pool.end();
      } catch (e) {
        console.error("❌ Error closing MySQL pool:", e?.message || e);
      }
      console.log("✅ Shutdown complete");
    })();
    return shutdownPromise;
  };

  process.on("SIGTERM", () => shutdown("SIGTERM").then(() => process.exit(0)));
  process.on("SIGINT", () => shutdown("SIGINT").then(() => process.exit(0)));
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
