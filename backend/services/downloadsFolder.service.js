import fs from "fs";
import path from "path";
import { badRequest, notFound } from "../utils/httpError.js";

// This physical path is at the same time what is served publicly (without auth)
// via the /uploads/downloads static route (routes/index.js) - agents (and these
// PowerShell presets) use it to download deployment files (cert
// rootCA.pem, UltraVNC zip, etc.) over HTTPS, without agent credentials.
const DOWNLOADS_DIR = path.join(process.cwd(), "uploads", "downloads");

function ensureDownloadsDir() {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// The folder is served publicly without auth, so the filename must be strictly
// sanitized - path.basename strips both / and \ path components, and the extra
// check below is defense in depth in case the platform/behavior ever changes.
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
