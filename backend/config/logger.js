import morgan from "morgan";

export const setupLogger = (app) => {
  app.use(
    morgan("combined", {
      skip: (req) => req.url === "/health" || req.url === "/ready",
    }),
  );
};
