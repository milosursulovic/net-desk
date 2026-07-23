import { insertActivityLog } from "../repositories/activityLog.repo.js";

// Generic HTTP-level audit trail for authenticated actions - not GET (reads
// aren't "actions"), and logged on res.on("finish") so the actual outcome
// (200 vs 403 vs 400) is captured, regardless of which downstream
// middleware/controller produced it. req.user must already be populated
// (mounted after authenticateToken). A logging failure must never break the
// request it's describing - errors are swallowed, not surfaced to the client.
export function auditLog(req, res, next) {
  if (req.method !== "GET") {
    res.on("finish", () => {
      insertActivityLog({
        userId: req.user?.userId ?? null,
        username: req.user?.username ?? null,
        action: `${req.method} ${req.originalUrl}`,
        ipAddress: req.ip,
        statusCode: res.statusCode,
      }).catch((err) => console.error("Audit log insert failed:", err));
    });
  }
  next();
}
