import express from "express";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { IS_PROD } from "./config/env.js";
import { setupCors } from "./config/cors.js";
import { setupLogger } from "./config/logger.js";
import routes from "./routes/index.js";
import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, "../frontend/dist");

export const createApp = () => {
  const app = express();
  // Deliberately false, not just the default: with trust proxy on, a
  // client could set X-Forwarded-For to spoof req.ip and dodge the
  // per-IP enroll rate limiter (agents.routes.js). Trade-off: if this app
  // is ever actually put behind a reverse proxy, every client will look
  // like one IP to the rate limiter - revisit together if that happens.
  app.set("trust proxy", false);

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      hsts: IS_PROD,
    }),
  );

  setupLogger(app);
  setupCors(app);

  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.status(200).send("ok"));

  app.locals.isDbReady = false;
  app.get("/ready", (_req, res) =>
    app.locals.isDbReady
      ? res.status(200).send("ready")
      : res.status(503).send("not ready"),
  );

  app.use(routes);

  // Conditional on frontend/dist actually existing (built) - keeps local
  // dev/tests behaving exactly as before when no build is present (backend
  // alone, or the integration test suite's "unmatched route -> 404" check),
  // while production (where `npm run build` always ran) gets a single
  // Express process serving the SPA too, so only one port needs to be
  // reachable instead of two. Static files first (fast exact-path match),
  // then a catch-all that serves index.html for anything else NOT under
  // /api - that's Vue Router's job to 404 on client-side (it already has
  // its own catch-all -> NotFoundView). Genuinely bad /api/* paths still
  // fall through to notFound below, unchanged.
  if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    app.use(express.static(FRONTEND_DIST));
    // Express 5 (path-to-regexp v7+) dropped the bare "*" wildcard - needs
    // a named wildcard segment instead.
    app.get("/*splat", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
