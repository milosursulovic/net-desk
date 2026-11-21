/**
 * Parses a query-string "true"/"false" into a boolean. Replaces ad hoc
 * String(req.query.x || "").toLowerCase() === "true" calls.
 */
export function parseBool(value, def = false) {
  if (value == null || value === "") return def;
  return String(value).trim().toLowerCase() === "true";
}

/**
 * Normalizuje query-string pretragu (trim, undefined/null -> "").
 */
export function parseSearchTerm(value) {
  return String(value ?? "").trim();
}
