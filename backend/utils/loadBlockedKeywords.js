import fs from "fs";
import path from "path";

export default function loadBlockedKeywords() {
  const filePath = path.resolve("config", "blocked_keywords.txt");

  if (!fs.existsSync(filePath)) {
    console.warn("⚠️  blocked_keywords.txt not found");
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}
