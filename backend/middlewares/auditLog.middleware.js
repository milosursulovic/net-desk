import { insertActivityLog } from "../repositories/activityLog.repo.js";

// A path ending in a bare numeric id ("/agents/47", "/reports/9") is a
// single-record view - list/search/pagination endpoints ("/agents",
// "/agents?page=2", "/agents/filter-options") never end that way, so this
// stays quiet for routine browsing while still catching "who looked at
// record X".
const SINGLE_RECORD_PATH = /\/\d+$/;

// Any key whose name contains "password" (case-insensitive) - covers
// password/currentPassword/newPassword today and anything password-like
// added later, without needing to keep an exact-match list in sync with
// every DTO. Matched by key name only, so it can't be defeated by nesting -
// redactBody walks nested objects too.
const SENSITIVE_KEY_PATTERN = /password/i;
const MAX_DETAILS_LENGTH = 2000;

function redactBody(value) {
  if (Array.isArray(value)) return value.map(redactBody);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactBody(val);
    }
    return out;
  }
  return value;
}

function detailsFor(body) {
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) return null;
  const json = JSON.stringify(redactBody(body));
  return json.length > MAX_DETAILS_LENGTH
    ? `${json.slice(0, MAX_DETAILS_LENGTH)}…`
    : json;
}

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
    // Snapshot now, not inside the finish callback - some routes (e.g.
    // multipart uploads) may have already discarded/streamed past req.body
    // by the time the response finishes.
    const details = isWrite ? detailsFor(req.body) : null;

    res.on("finish", () => {
      insertActivityLog({
        userId: req.user?.userId ?? null,
        username: req.user?.username ?? null,
        action: `${req.method} ${req.originalUrl}`,
        ipAddress: req.ip,
        statusCode: res.statusCode,
        details,
      }).catch((err) => console.error("Audit log insert failed:", err));
    });
  }
  next();
}
