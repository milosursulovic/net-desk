import cors from "cors";
import { IS_PROD, CORS_ALLOWED_ORIGINS } from "./env.js";

export const setupCors = (app) => {
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);

        if (!IS_PROD && CORS_ALLOWED_ORIGINS.length === 0)
          return cb(null, true);
        if (CORS_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);

        return cb(new Error("Not allowed by CORS: " + origin));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.options(/.*/, cors());
};
