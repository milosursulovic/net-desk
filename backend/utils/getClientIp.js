export default function getClientIp(req) {
  const xfwd = req.headers["x-forwarded-for"];
  let ip = "";

  if (typeof xfwd === "string" && xfwd.length > 0) {
    ip = xfwd.split(",")[0].trim();
  } else {
    ip = req.socket?.remoteAddress || req.ip || "";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }

  return ip;
}
