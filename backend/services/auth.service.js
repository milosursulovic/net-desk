import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/env.js";
import { unauthorized } from "../utils/httpError.js";
import {
  findUserByUsername,
  findUserByIdWithPassword,
  updateUserPasswordHash,
} from "../repositories/users.repo.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";

// Two comparison paths: bcrypt hashes always start with "$2" (bcryptjs
// format), so anything else is a legacy plaintext password from before
// bcrypt was introduced. On a successful plaintext match we transparently
// upgrade it to a bcrypt hash - a one-time, self-healing migration that
// needs no separate script or forced password reset for old accounts.
// Shared by login() and changePassword() so the two paths can't drift.
async function verifyPassword(userId, plain, stored) {
  if (typeof stored === "string" && stored.startsWith("$2")) {
    return await bcrypt.compare(plain, stored);
  }
  const isMatch = plain === stored;
  if (isMatch) {
    const newHash = await bcrypt.hash(plain, 10);
    await updateUserPasswordHash(userId, newHash);
  }
  return isMatch;
}

export async function login(username, password, ip) {
  const user = await findUserByUsername(username);

  const isMatch = user ? await verifyPassword(user.id, password, user.password) : false;

  if (!isMatch) {
    await insertActivityLog({
      userId: user?.id ?? null,
      username,
      action: "login_failed",
      ipAddress: ip,
      statusCode: 401,
    });
    throw unauthorized("Neispravni kredencijali");
  }

  const role = user.role;

  const token = jwt.sign(
    { userId: user.id, username: user.username, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, algorithm: "HS256" },
  );

  await insertActivityLog({
    userId: user.id,
    username: user.username,
    action: "login_success",
    ipAddress: ip,
    statusCode: 200,
  });

  return { token, expiresIn: JWT_EXPIRES_IN };
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await findUserByIdWithPassword(userId);
  if (!user) {
    throw unauthorized("Korisnik nije pronađen");
  }

  const isMatch = await verifyPassword(user.id, currentPassword, user.password);
  if (!isMatch) {
    throw unauthorized("Pogrešna trenutna lozinka");
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await updateUserPasswordHash(userId, newHash);
}

export function getMeFromToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role || "viewer",
    };
  } catch {
    throw unauthorized("Nevažeći ili istekao token");
  }
}
