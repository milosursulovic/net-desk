import fs from "fs";
import crypto from "crypto";
import { AGENT_SIGNING_CERT_PATH, AGENT_SIGNING_KEY_PATH } from "../config/env.js";

/**
 * Potpisivanje release paketa (spec 7 - "mogućnost provere digitalnog
 * potpisa"). Server potpisuje SHA-256/RSA preko sertifikata izdatog od
 * interne CA koja je već distribuirana u trusted root store svih upravljanih
 * računara - agent proverava potpis I da sertifikat vodi do te iste trusted
 * root preko System.Security.Cryptography.X509Certificates.X509Chain (videti
 * service/Netdesk.Agent.Common/Update/UpdateManager.cs).
 *
 * Namerno opciono: ako AGENT_SIGNING_CERT_PATH/AGENT_SIGNING_KEY_PATH nisu
 * podešeni, release-i se i dalje mogu otpremati - samo bez potpisa (agent
 * tada samo proveri SHA-256, kao i do sada).
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

export function isSigningConfigured() {
  load();
  return !!(cachedCertPem && cachedKeyPem);
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
