import fs from "fs";
import crypto from "crypto";
import { AGENT_SIGNING_CERT_PATH, AGENT_SIGNING_KEY_PATH } from "../config/env.js";

/**
 * Signing of release packages (spec 7 - "ability to verify the digital
 * signature"). The server signs SHA-256/RSA with a certificate issued by the
 * internal CA that is already distributed into the trusted root store of all managed
 * computers - the agent verifies the signature AND that the certificate chains to that same trusted
 * root via System.Security.Cryptography.X509Certificates.X509Chain (see
 * service/Netdesk.Agent.Common/Update/UpdateManager.cs).
 *
 * Deliberately optional: if AGENT_SIGNING_CERT_PATH/AGENT_SIGNING_KEY_PATH aren't
 * configured, releases can still be uploaded - just without a signature (the agent
 * then only checks SHA-256, as before).
 */

let loaded = false;
let cachedCertPem = null;
let cachedKeyPem = null;

function load() {
  if (loaded) return;
  loaded = true;

  if (!AGENT_SIGNING_CERT_PATH || !AGENT_SIGNING_KEY_PATH) {
    console.warn(
      "⚠️ AGENT_SIGNING_CERT_PATH/AGENT_SIGNING_KEY_PATH nisu podešeni - agent release paketi se neće potpisivati.",
    );
    return;
  }

  if (!fs.existsSync(AGENT_SIGNING_CERT_PATH) || !fs.existsSync(AGENT_SIGNING_KEY_PATH)) {
    console.error(
      "❌ Agent signing cert/key fajlovi ne postoje na zadatim putanjama - potpisivanje release-a onemogućeno.",
    );
    return;
  }

  cachedCertPem = fs.readFileSync(AGENT_SIGNING_CERT_PATH, "utf8");
  cachedKeyPem = fs.readFileSync(AGENT_SIGNING_KEY_PATH, "utf8");
}

export function signBuffer(buffer) {
  load();
  if (!cachedKeyPem) return null;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(buffer);
  signer.end();
  return signer.sign(cachedKeyPem, "base64");
}

export function getSigningCertificatePem() {
  load();
  return cachedCertPem;
}
