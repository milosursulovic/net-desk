import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } from "../config/env.js";

// migrations/*.sql, u redosledu imena fajla - konvencija je "NNNN_opis.sql"
// (npr. "0001_add_foo_column.sql") da sortiranje po imenu bude i hronološki
// redosled. Svaki fajl se primeni TAČNO JEDNOM - schema_migrations tabela
// pamti koji je već primenjen, pa je ponovno pokretanje bezbedno (samo NOVI
// fajlovi se izvrše).
const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

// dir je parametrizovan (podrazumevano MIGRATIONS_DIR) isključivo da bi test
// mogao da pokaže na privremeni folder sa fiktivnim .sql fajlovima umesto da
// dodiruje pravi migrations/ folder ili čeka na stvarne migracije da postoje.
export async function runMigrations(dir = MIGRATIONS_DIR) {
  fs.mkdirSync(dir, { recursive: true });

  // Poseban connection (ne deljeni app pool) - multipleStatements:true je
  // namerno SAMO ovde, migracije legitimno mogu imati više SQL naredbi u
  // jednom fajlu, dok aplikacijin glavni pool tu opciju nikad ne sme imati
  // (širi SQL injection rizik svuda drugde).
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

// process.argv[1] je apsolutna putanja fajla koji je pokrenut sa `node ...` -
// poklapanje sa import.meta.url (preko pathToFileURL, ne ručno sastavljanje
// "file://" stringa - Windows apsolutne putanje sa slovom diska inače lako
// upadnu u pogrešan broj kosih crta) znači da je OVAJ fajl direktno pokrenut
// (`node scripts/migrate.js`), ne samo import-ovan iz testa.
const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  runMigrations().catch((err) => {
    console.error("Migracija neuspešna:", err);
    process.exit(1);
  });
}
