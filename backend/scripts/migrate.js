import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } from "../config/env.js";

// migrations/*.sql, in filename order - the convention is "NNNN_description.sql"
// (e.g. "0001_add_foo_column.sql") so that sorting by name is also chronological
// order. Each file is applied EXACTLY ONCE - the schema_migrations table
// remembers which ones were already applied, so re-running is safe (only NEW
// files are executed).
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// dir is parameterized (defaults to MIGRATIONS_DIR) solely so a test
// can point at a temporary folder with fake .sql files instead of
// touching the real migrations/ folder or waiting for real migrations to exist.
export async function runMigrations(dir = MIGRATIONS_DIR) {
  fs.mkdirSync(dir, { recursive: true });

  // A dedicated connection (not the shared app pool) - multipleStatements:true is
  // deliberately ONLY here, migrations can legitimately have several SQL statements in
  // one file, while the application's main pool must never have that option
  // (a wider SQL injection risk everywhere else).
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [appliedRows] = await connection.query("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedRows.map((r) => r.filename));

    const pending = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => !applied.has(f));

    if (!pending.length) {
      console.log("Nema novih migracija.");
      return { applied: [] };
    }

    for (const file of pending) {
      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      console.log(`Primenjujem migraciju: ${file}`);
      await connection.query(sql);
      await connection.query("INSERT INTO schema_migrations (filename) VALUES (?)", [file]);
      console.log(`Primenjeno: ${file}`);
    }

    console.log(`Ukupno primenjeno ${pending.length} migracija.`);
    return { applied: pending };
  } finally {
    await connection.end();
  }
}

// process.argv[1] is the absolute path of the file launched with `node ...` -
// matching it against import.meta.url (via pathToFileURL, not by hand-building a
// "file://" string - Windows absolute paths with a drive letter otherwise easily
// end up with the wrong number of slashes) means THIS file was run directly
// (`node scripts/migrate.js`), not merely imported from a test.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runMigrations().catch((err) => {
    console.error("Migracija neuspešna:", err);
    process.exit(1);
  });
}
