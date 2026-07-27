import { recordRequest } from "../utils/requestMetrics.js";

/**
 * Mounted early (app.js) so it wraps every request. Reads req.route on the
 * "finish" event, not before - Express hasn't matched a route yet when this
 * middleware itself runs, but has by the time the response is done. Uses
 * the matched route PATTERN (e.g. "/agents/:id"), not the raw URL, so
 * /agents/47 and /agents/48 aggregate together instead of exploding into a
 * distinct key per numeric id.
 */
export function requestMetricsMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;

    recordRequest({
      method: req.method,
      route,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
