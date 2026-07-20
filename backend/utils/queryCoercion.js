/**
 * Parsira query-string "true"/"false" u boolean. Zamenjuje ad hoc
 * String(req.query.x || "").toLowerCase() === "true" pozive.
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
