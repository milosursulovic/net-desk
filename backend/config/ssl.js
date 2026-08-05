import fs from "fs";
import { SSL_KEY, SSL_CERT } from "./env.js";

// Windows 7 agenti (.NET Framework 4.5.2, ServicePointManager.SecurityProtocol
// = Tls12) bez KB4019276 update-a nemaju ECDHE/AES-GCM cipher suite-ove -
// Node-ov moderan default cipher set ih ostavlja bez ijednog zajedničkog
// suite-a sa serverom, pa TLS handshake propadne (.NET to prijavljuje
// zbunjujuće kao "remote certificate is invalid"). Eksplicitno dodajemo
// RSA/CBC suite-ove koje stariji Windows 7 klijenti nude kao fallback, uz
// honorCipherOrder da moderni klijenti i dalje dobiju jače ECDHE/GCM suite-ove
// prve u listi. minVersion ostaje TLS 1.2 (ništa slabije se ne dozvoljava).
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
