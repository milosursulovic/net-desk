import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/env.js";
import { unauthorized } from "../utils/httpError.js";
import {
  findUserByUsername,
  updateUserPasswordHash,
} from "../repositories/users.repo.js";

export async function login(username, password) {
  const user = await findUserByUsername(username);
  if (!user) {
    throw unauthorized("Neispravni kredencijali");
  }

  let isMatch = false;

  // Two comparison paths: bcrypt hashes always start with "$2" (bcryptjs
  // format), so anything else is a legacy plaintext password from before
  // bcrypt was introduced. On a successful plaintext match we transparently
  // upgrade it to a bcrypt hash - a one-time, self-healing migration that
  // needs no separate script or forced password reset for old accounts.
  if (typeof user.password === "string" && user.password.startsWith("$2")) {
    isMatch = await bcrypt.compare(password, user.password);
  } else {
    isMatch = password === user.password;
    if (isMatch) {
      const newHash = await bcrypt.hash(password, 10);
      await updateUserPasswordHash(user.id, newHash);
    }
  }

  if (!isMatch) {
    throw unauthorized("Neispravni kredencijali");
  }

  // No roles table/column exists yet - "admin" is the one hardcoded
  // username treated as privileged, everyone else is a plain "user". Revisit
  // if/when real per-user roles are needed.
  const role = user.username === "admin" ? "admin" : "user";

  const token = jwt.sign(
    { userId: user.id, username: user.username, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" },
  );

  return { token, expiresIn: JWT_EXPIRES_IN };
}

export function getMeFromToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role || "user",
    };
  } catch {
    throw unauthorized("Nevažeći ili istekao token");
  }
}
