import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Migration from "../models/Migration.js";
import { pathToFileURL } from "url";

dotenv.config();

const migrationsDir = path.resolve("./database/migrations");

async function runMigrations() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".js"))
      .sort();

    for (const file of files) {
      const migrationName = path.basename(file, ".js");

      const alreadyRun = await Migration.findOne({ name: migrationName });
      if (alreadyRun) {
        console.log(`Migration '${migrationName}' already run. Skipping.`);
        continue;
      }

      const migrationPath = path.join(migrationsDir, file);
      const migrationFn = (await import(pathToFileURL(migrationPath))).default;

      if (typeof migrationFn === "function") {
        await migrationFn();
        await Migration.create({ name: migrationName });
        console.log(`Migration '${migrationName}' executed.`);
      } else {
        console.warn(
          `Migration '${migrationName}' does not export a default function. Skipping.`
        );
      }
    }

    console.log("All migrations completed.");
    process.exit(0);
  } catch (err) {
    console.error("Error running migrations:", err);
    process.exit(1);
  }
}

runMigrations();
