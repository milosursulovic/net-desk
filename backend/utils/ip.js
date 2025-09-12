export function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255
  );
}

export function ipToNumeric(ip) {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4: ${ip}`);
  return (
    ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

export function numericToIp(num) {
  if (!Number.isInteger(num) || num < 0 || num > 0xffffffff) {
    throw new Error(`Invalid IPv4 numeric: ${num}`);
  }
  return [24, 16, 8, 0].map((shift) => (num >>> shift) & 255).join(".");
}
