import crypto from "crypto";
import { MANAGER_ENROLL_TOKEN } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findManagerByUid } from "../repositories/managers.repo.js";
import { unauthorized, forbidden } from "../utils/httpError.js";

function parseBearer(req) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  return type === "Bearer" && token ? token : null;
}

export function requireManagerEnrollToken(req, _res, next) {
  const token = parseBearer(req);
  if (!token || token !== MANAGER_ENROLL_TOKEN) {
    throw unauthorized("Neispravan enroll token");
  }
  next();
}

export async function authenticateManager(req, _res, next) {
  const token = parseBearer(req);
  const sepIdx = token ? token.indexOf(":") : -1;
  if (sepIdx <= 0) {
    throw unauthorized("Nedostaju manager kredencijali");
  }

  const managerUid = token.slice(0, sepIdx);
  const apiKey = token.slice(sepIdx + 1);

  const manager = await findManagerByUid(managerUid);
  if (!manager || manager.status !== "active") {
    throw forbidden("Manager nije pronađen ili je onemogućen");
  }

  const providedHash = Buffer.from(hashApiKey(apiKey), "hex");
  const storedHash = Buffer.from(manager.apiKeyHash, "hex");

  // Isti razlog kao agentAuth.middleware.js's authenticateAgent - dužina se
  // proverava PRE timingSafeEqual jer ta funkcija baca na neusklađenim
  // dužinama bafera umesto da vrati false.
  const isMatch =
    providedHash.length === storedHash.length &&
    crypto.timingSafeEqual(providedHash, storedHash);

  if (!isMatch) {
    throw forbidden("Neispravan API ključ");
  }

  req.manager = {
    id: manager.id,
    managerUid: manager.managerUid,
    ipEntryId: manager.ipEntryId,
    managerVersion: manager.managerVersion,
  };
  next();
}
