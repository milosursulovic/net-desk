---
name: db-migration
description: Use whenever a task requires changing the database schema in net-desk (new column, new table, new index, altering an existing column). Never hand-write and run ALTER TABLE/CREATE TABLE directly against the dev database for a schema change meant to ship - it must go through backend/migrations/.
---

# Adding a database migration (net-desk)

Schema changes go through `backend/migrations/*.sql`, applied via
`backend/scripts/migrate.js` (`npm run migrate` from `backend/`). A
`schema_migrations` table tracks which files have already run, so re-running
is always safe — only new files execute.

## Steps

1. Look at `backend/migrations/` to find the highest existing number
   (`ls backend/migrations/`).
2. Create a new file named `NNNN_short_description.sql` — 4-digit, one
   higher than the last one, snake_case description. Sorting by filename
   must equal chronological order, since that's the application order.
3. Write plain SQL (`ALTER TABLE ...`, `CREATE TABLE ...`, etc.) — no
   wrapping, no transaction statements, the migration runner handles that.
4. Run `npm run migrate` from `backend/` against the local dev DB to apply
   it and confirm it works before considering the task done.
5. Update `backend/repositories/*.js` (SELECT field lists, INSERT/UPDATE
   statements) for any table/column this migration touches — a new column
   is invisible to the app until a repository actually selects/writes it.

## Things to know before writing the migration

- **There is no baseline schema file.** The full schema predating migration
  `0001` only exists as already-applied state on the live database — only
  incremental changes from `0001` onward are tracked in
  `backend/migrations/`. Don't assume you can reconstruct the full schema
  from the migrations directory alone; if you need the current shape of a
  table, check the live dev DB directly (`mysql ... -e "DESCRIBE table_name"`
  or `SHOW CREATE TABLE table_name`) rather than guessing from migration
  files.
- All tables use `id INT AUTO_INCREMENT` primary keys and `utf8mb4`.
- FKs to `agents.id` consistently use `ON DELETE CASCADE`.
- Ask before running `npm run migrate` if it's not already an established
  routine step in the current conversation — it writes to the real local
  dev database.
