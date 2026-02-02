import express from "express";
import helmet from "helmet";
import { IS_PROD } from "./config/env.js";
import { setupCors } from "./config/cors.js";
import { setupLogger } from "./config/logger.js";
import routes from "./routes/index.js";
import { notFound } from "./middlewares/notFound.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";

export const createApp = () => {
    const app = express();
    app.set("trust proxy", true);

    app.use(
        helmet({
            crossOriginResourcePolicy: false,
            hsts: IS_PROD,
        })
    );

    setupLogger(app);
    setupCors(app);

    app.use(express.json({ limit: "2mb" }));

    app.get("/health", (_req, res) => res.status(200).send("ok"));

    app.locals.isDbReady = false;
    app.get("/ready", (_req, res) =>
        app.locals.isDbReady ? res.status(200).send("ready") : res.status(503).send("not ready")
    );

    app.use(routes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
};
