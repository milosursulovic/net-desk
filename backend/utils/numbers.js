export function toInt(v, def = null) {
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : def;
}

export function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}