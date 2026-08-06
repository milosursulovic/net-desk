import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runMigrations } from "../../scripts/migrate.js";
import { pool } from "../../db/pool.js";

describe("runMigrations (integration, real DB)", () => {
  let tmpDir;
  const testFileNames = [];

  afterEach(async () => {
    await pool.execute("DROP TABLE IF EXISTS vitest_migration_test");
    if (testFileNames.length) {
      await pool.query(
        `DELETE FROM schema_migrations WHERE filename IN (${testFileNames.map(() => "?").join(",")})`,
        testFileNames,
      );
      testFileNames.length = 0;
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("applies a new .sql migration and records it, then skips it on a second run", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "netdesk-migrate-test-"));
    const fileName = `9999_vitest_${Date.now()}.sql`;
    testFileNames.push(fileName);
    fs.writeFileSync(
      path.join(tmpDir, fileName),
      "CREATE TABLE vitest_migration_test (id INT NOT NULL PRIMARY KEY);",
    );

    const first = await runMigrations(tmpDir);
    expect(first.applied).toEqual([fileName]);

    const [tables] = await pool.query("SHOW TABLES LIKE 'vitest_migration_test'");
    expect(tables.length).toBe(1);

    const [rows] = await pool.execute("SELECT filename FROM schema_migrations WHERE filename = ?", [
      fileName,
    ]);
    expect(rows).toHaveLength(1);

    // Ponovno pokretanje nad ISTIM folderom ne sme opet da izvrši isti fajl
    // (CREATE TABLE bez IF NOT EXISTS bi drugi put bacio grešku da se
    // pogrešno ponovo pokrenulo).
    const second = await runMigrations(tmpDir);
    expect(second.applied).toEqual([]);
  });

  it("applies multiple pending migrations in filename order", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "netdesk-migrate-test-"));
    const stamp = Date.now();
    const fileA = `9998_vitest_a_${stamp}.sql`;
    const fileB = `9999_vitest_b_${stamp}.sql`;
    testFileNames.push(fileA, fileB);

    fs.writeFileSync(
      path.join(tmpDir, fileA),
      "CREATE TABLE vitest_migration_test (id INT NOT NULL PRIMARY KEY);",
    );
    fs.writeFileSync(
      path.join(tmpDir, fileB),
      "ALTER TABLE vitest_migration_test ADD COLUMN note VARCHAR(50) NULL;",
    );

    const result = await runMigrations(tmpDir);
    expect(result.applied).toEqual([fileA, fileB]);

    const [cols] = await pool.query("SHOW COLUMNS FROM vitest_migration_test LIKE 'note'");
    expect(cols.length).toBe(1);
  });
});
