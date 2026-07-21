import crypto from "crypto";
import { AGENT_ENROLL_TOKEN } from "../config/env.js";
import { hashApiKey } from "../utils/apiKey.js";
import { findAgentByUid } from "../repositories/agents.repo.js";
import { unauthorized, forbidden } from "../utils/httpError.js";

function parseBearer(req) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");
  return type === "Bearer" && token ? token : null;
}

export function requireEnrollToken(req, _res, next) {
  const token = parseBearer(req);
  if (!token || token !== AGENT_ENROLL_TOKEN) {
    throw unauthorized("Neispravan enroll token");
  }
  next();
}

export async function authenticateAgent(req, _res, next) {
  const token = parseBearer(req);
  const sepIdx = token ? token.indexOf(":") : -1;
  if (sepIdx <= 0) {
    throw unauthorized("Nedostaju agent kredencijali");
  }

  const agentUid = token.slice(0, sepIdx);
  const apiKey = token.slice(sepIdx + 1);

  const agent = await findAgentByUid(agentUid);
  if (!agent || agent.status !== "active") {
    throw forbidden("Agent nije pronađen ili je onemogućen");
  }

  const providedHash = Buffer.from(hashApiKey(apiKey), "hex");
  const storedHash = Buffer.from(agent.apiKeyHash, "hex");

  // The length check isn't an optimization - timingSafeEqual throws on
  // mismatched-length buffers, so this guards against a crash on malformed
  // input while still keeping the actual comparison constant-time (a
  // regular === here would leak key length/prefix via timing).
  const isMatch =
    providedHash.length === storedHash.length &&
    crypto.timingSafeEqual(providedHash, storedHash);

  if (!isMatch) {
    throw forbidden("Neispravan API ključ");
  }

  req.agent = {
    id: agent.id,
    agentUid: agent.agentUid,
    ipEntryId: agent.ipEntryId,
    agentVersion: agent.agentVersion,
    deploymentGroup: agent.deploymentGroup,
  };
  next();
}
