/**
 * Tolerantan parser za "datum-ish" vrednosti sa klijenata (agent WMI/registry
 * podaci, ali i drugi izvori) - vraća null umesto da propusti neparsabilan
 * string do mysql2 (koji bi bacio grešku poput "Incorrect date value" i srušio
 * ceo insert). Prihvata Date instancu, ISO string/broj, ili { $date } oblik.
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
