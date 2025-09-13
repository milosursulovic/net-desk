export default function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  if (typeof xfwd === "string" && xfwd.length > 0) {
    // XFF can be a comma-separated list; take the first (original client)
    return xfwd.split(",")[0].trim();
  }
  // Fallbacks
  return req.socket?.remoteAddress || req.ip || "";
}
