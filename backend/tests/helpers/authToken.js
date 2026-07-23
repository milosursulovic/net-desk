import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../../config/env.js";

/**
 * Mints a valid admin JWT directly (bypassing the real login flow/DB user
 * lookup) - same payload shape as auth.service.js's login(). Fine for
 * HTTP-level route tests where the point is exercising route wiring and
 * controllers, not the login flow itself (which has its own tests).
 */
export function adminToken() {
  return jwt.sign(
    { userId: 1, username: "vitest-admin", role: "admin" },
    JWT_SECRET,
    { expiresIn: "1h", algorithm: "HS256" },
  );
}

export function operatorToken() {
  return jwt.sign(
    { userId: 2, username: "vitest-operator", role: "operator" },
    JWT_SECRET,
    { expiresIn: "1h", algorithm: "HS256" },
  );
}

export function viewerToken() {
  return jwt.sign(
    { userId: 3, username: "vitest-viewer", role: "viewer" },
    JWT_SECRET,
    { expiresIn: "1h", algorithm: "HS256" },
  );
}
