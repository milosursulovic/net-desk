import { insertActivityLog } from "../repositories/activityLog.repo.js";

// A path ending in a bare numeric id ("/agents/47", "/reports/9") is a
// single-record view - list/search/pagination endpoints ("/agents",
// "/agents?page=2", "/agents/filter-options") never end that way, so this
// stays quiet for routine browsing while still catching "who looked at
// record X".
const SINGLE_RECORD_PATH = /\/\d+$/;

// Generic HTTP-level audit trail for authenticated actions: every write
// (non-GET) plus GET requests that view one specific record. Logged on
// res.on("finish") so the actual outcome (200 vs 403 vs 400) is captured,
// regardless of which downstream middleware/controller produced it.
// req.user must already be populated (mounted after authenticateToken). A
// logging failure must never break the request it's describing - errors are
// swallowed, not surfaced to the client.
export function auditLog(req, res, next) {
  const isWrite = req.method !== "GET";
  const isRecordView = req.method === "GET" && SINGLE_RECORD_PATH.test(req.path);

  if (isWrite || isRecordView) {
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
