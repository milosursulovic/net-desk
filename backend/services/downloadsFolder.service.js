import fs from "fs";
import path from "path";
import { badRequest, notFound } from "../utils/httpError.js";

// Ova fizička putanja je istovremeno i ono što se javno (bez auth-a) servira
// preko /uploads/downloads static rute (routes/index.js) - agenti (i ovi
// PowerShell preseti) je koriste za preuzimanje deployment fajlova (cert
// rootCA.pem, UltraVNC zip, itd) preko HTTPS-a, bez agent kredencijala.
const DOWNLOADS_DIR = path.join(process.cwd(), "uploads", "downloads");

function ensureDownloadsDir() {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Folder je javno serviran bez auth-a, pa ime fajla mora biti strogo
// sanitizovano - path.basename uklanja i / i \ komponente puta, a dodatna
// provera ispod je odbrana u dubinu ako se ikad promeni platforma/ponašanje.
function sanitizeFileName(rawName) {
  const name = path.basename(String(rawName || "").trim());
  if (!name || name === "." || name === "..") {
    throw badRequest("Neispravno ime fajla");
  }
  if (/[\\/]/.test(name)) {
    throw badRequest("Neispravno ime fajla");
  }

  const destPath = path.join(DOWNLOADS_DIR, name);
  if (path.dirname(destPath) !== DOWNLOADS_DIR) {
    throw badRequest("Neispravno ime fajla");
  }

  return { name, destPath };
}

export async function listDownloadsFolderFilesService() {
  ensureDownloadsDir();

  const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => {
      const stat = fs.statSync(path.join(DOWNLOADS_DIR, e.name));
      return {
        name: e.name,
        size: stat.size,
        modifiedAt: stat.mtime,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return files;
}

export async function uploadToDownloadsFolderService({ buffer, originalName }) {
  if (!buffer || !buffer.length) {
    throw badRequest("Fajl je obavezan");
  }

  ensureDownloadsDir();
  const { name, destPath } = sanitizeFileName(originalName);
  fs.writeFileSync(destPath, buffer);

  const stat = fs.statSync(destPath);
  return { name, size: stat.size, modifiedAt: stat.mtime };
}

export async function deleteFromDownloadsFolderService(rawName) {
  const { destPath } = sanitizeFileName(rawName);

  if (!fs.existsSync(destPath)) {
    throw notFound("Fajl nije pronađen");
  }

  fs.unlinkSync(destPath);
}
