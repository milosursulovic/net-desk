import fs from "fs";
import { SSL_KEY, SSL_CERT } from "./env.js";

export const getSslOptions = () => {
  if (!fs.existsSync(SSL_KEY) || !fs.existsSync(SSL_CERT)) {
    console.error("❌ SSL files don't exist at provided paths");
    process.exit(1);
  }
  return {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
  };
};
