import fs from "fs";
import { SSL_KEY, SSL_CERT } from "./env.js";

// Windows 7 agents (.NET Framework 4.5.2, ServicePointManager.SecurityProtocol
// = Tls12) without the KB4019276 update lack ECDHE/AES-GCM cipher suites -
// Node's modern default cipher set leaves them without a single suite in
// common with the server, so the TLS handshake fails (.NET reports it
// confusingly as "remote certificate is invalid"). We explicitly add the
// RSA/CBC suites older Windows 7 clients offer as a fallback, with
// honorCipherOrder so modern clients still get the stronger ECDHE/GCM suites
// first in the list. minVersion stays TLS 1.2 (nothing weaker is allowed).
const CIPHERS = [
  "ECDHE-RSA-AES128-GCM-SHA256",
  "ECDHE-RSA-AES256-GCM-SHA384",
  "ECDHE-RSA-AES128-SHA256",
  "ECDHE-RSA-AES256-SHA384",
  "AES128-GCM-SHA256",
  "AES256-GCM-SHA384",
  "AES128-SHA256",
  "AES256-SHA256",
  "AES128-SHA",
  "AES256-SHA",
].join(":");

export const getSslOptions = () => {
  if (!fs.existsSync(SSL_KEY) || !fs.existsSync(SSL_CERT)) {
    console.error("❌ SSL files don't exist at provided paths");
    process.exit(1);
  }
  return {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
    minVersion: "TLSv1.2",
    ciphers: CIPHERS,
    honorCipherOrder: true,
  };
};
