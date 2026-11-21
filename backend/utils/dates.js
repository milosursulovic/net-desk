/**
 * Tolerant parser for "date-ish" values from clients (agent WMI/registry
 * data, but other sources too) - returns null instead of letting an unparseable
 * string through to mysql2 (which would throw an error like "Incorrect date value" and break
 * the whole insert). Accepts a Date instance, an ISO string/number, or a { $date } shape.
 */
export function parseDateMaybe(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "object" && v.$date) {
    const d = new Date(v.$date);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (v instanceof Date) return v;
  return null;
}
