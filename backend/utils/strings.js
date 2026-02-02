export function emptyToNull(v) {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
}
