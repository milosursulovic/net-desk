export default function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  let ip = "";

  if (typeof xfwd === "string" && xfwd.length > 0) {
    ip = xfwd.split(",")[0].trim();
  } else {
    ip = req.socket?.remoteAddress || req.ip || "";
  }

  // Normalize IPv6-mapped IPv4, e.g. ::ffff:10.230.62.105 → 10.230.62.105
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  return ip;
}
