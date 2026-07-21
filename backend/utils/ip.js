const PRIVATE_V4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

export function isValidIPv4(ip) {
  if (typeof ip !== "string") return false;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255,
  );
}

export function ipToNumeric(ip) {
  if (!isValidIPv4(ip)) throw new Error(`Invalid IPv4: ${ip}`);
  // The trailing >>> 0 matters, not decoration: JS bitwise ops work on
  // signed 32-bit ints, so any IP whose first octet is >= 128 would
  // overflow into a negative number without this unsigned shift - it
  // would still sort correctly relative to other IPs, but comparisons
  // against a stored ip_numeric value would be wrong.
  return (
    ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0
  );
}

export const isPrivateIPv4 = (ip) => PRIVATE_V4.test(ip);
