# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NetDesk: an internal RMM (Remote Monitoring & Management) tool for a healthcare IT org with two sites — "bolnica" (10.230.62.0/23) and "dom_zdravlja" (10.160.64.0/21). Three independent parts: `backend/` (Node/Express API), `frontend/` (Vue 3 SPA), `service/` (C# Windows agent installed on managed PCs). Full architecture/DB/API/security docs live in [`docs/TECHNICAL.md`](docs/TECHNICAL.md) — read that for anything beyond what's below. [`README.md`](README.md) has setup/env-var/script details.

## Commands

Backend (`backend/`):
- `npm test` — run all tests once (vitest, hits the real local dev MariaDB, not mocks)
- `npx vitest run tests/integration/<file>.test.js` — single file
- `npx vitest run tests/integration/<file>.test.js -t "test name"` — single test
- `npm run migrate` — apply any new files in `backend/migrations/*.sql`
- `npm run dev` — nodemon dev server

Frontend (`frontend/`):
- `npm run build` — production build; also the closest thing to a type/syntax check (no separate typecheck script, plain JS)
- `npm test` / `npx vitest run tests/unit/<file>.test.js` — same vitest conventions as backend
- `npm run lint` / `npm run lint:fix` — eslint
- `npm run dev` — Vite dev server

Windows agent (`service/`): `dotnet build -c Release` from `service/` builds all four projects (Common, Service, Manager, Updater). Read `service/README.md` and `service/DEPLOYMENT.md` before touching anything here — there are several non-obvious constraints (TLS 1.2 on Win7, a Newtonsoft.Json contract-resolver gotcha, the Updater-vs-Service folder split for auto-update).

## Workflow expectations

- Only commit/push when explicitly asked to — don't do it proactively after finishing a change.
- After any backend or frontend change, run `npm test` (backend) and `npm run build` (frontend) before considering the work done — there's no CI, these two commands are the substitute. `notifications.service.test.js` has 3 pre-existing failures unrelated to most changes (a known flaky baseline, not worth chasing unless the task is specifically about that file).
- Any commit touching `service/` must bump `AgentVersionInfo.Current` in `service/Netdesk.Agent.Common/AgentVersionInfo.cs` — the auto-update flow keys off this string, and forgetting it means a rebuilt agent is never offered to the fleet. Frontend version bumps are automatic; no action needed there.
- Schema changes go through `backend/migrations/*.sql` (numbered `NNNN_description.sql`, applied in filename order, tracked in a `schema_migrations` table so re-running is safe) + `npm run migrate` — never hand-apply SQL to a live database.

## Architecture

Backend is a strict layered architecture, no ORM (raw SQL via `mysql2`):
```
routes/ → controllers/ → services/ → repositories/
```
Controllers never write SQL; repositories never see `req`/`res`. `dtos/` holds zod schemas for request validation. This split is enforced consistently — when adding an endpoint, touch all four layers rather than shortcutting it.

Two completely separate auth models coexist in the same process: JWT (`Authorization: Bearer <jwt>`, admin users, `/api/protected/*`) and a per-agent static API key (`Authorization: Bearer <agentId>:<apiKey>`, `/api/agents/*`). `writeRequiresOperator` (`middlewares/requireRole.middleware.js`) is the default policy on `/api/protected/*` — GET is open to any authenticated role, writes need at least `operator`. Stricter routes layer `requireRole("admin")` on top; a few (Korisnici/Logovi/Konfiguracija) go further with `requireRootAdmin`, which checks the literal username `"admin"`, not just the role — the `admin` role can be granted to more than one account, but these three modules are meant for exactly one person.

`ip_entries` is the hub of the data model — agents, `computer_metadata`, printers, and the PDSU tables all hang off it via FK, and almost every list/filter/report is scoped by `site` (a query param, never read from `localStorage` directly inside a component — see `useCurrentSite()`). `computer_metadata` is a 1:1 flat table per computer plus four child tables (storage/RAM modules/GPUs/NICs); writes go through merge/patch semantics (`patchMetadataForIpEntry`) for most fields but full-replace for the array children, because the agent sends partial syncs (e.g. event-log-only) that must not wipe previously-synced hardware data.

Route registration order matters: a literal-segment route (`/agents/ids`, `/ip-addresses/free`) must be registered before a sibling `/:id` route in the same router, or Express swallows it as an id param. This has caused real incidents and is covered by `tests/integration/http.routes.test.js`.

Frontend: Vue 3 Composition API (`<script setup>`), one file per view under `views/`. `usePaginatedRoute` syncs filter/pagination state to the URL query string and is used consistently across every listing page — follow that pattern for new listing pages rather than inventing local state. Dark mode is implemented centrally in `main.css` by remapping the utility classes the app already uses (`bg-white`, `text-slate-*`, etc.) under a `.dark` selector, not by sprinkling `dark:` variants through individual components.

Windows agent (`service/`, .NET Framework 4.5.2 — deliberately, for Windows 7 SP1+ support): `Netdesk.Agent.Common` holds shared collectors/HTTP client/config, `Netdesk.Agent.Service` is the actual Windows Service process, `Netdesk.Agent.Updater` is a separate process (a running process can't overwrite its own files on Windows) that performs the file swap during auto-update. The install layout splits `Service\` (overwritten on every update) from `Updater\` (never overwritten) for exactly that reason.

## Testing conventions

Backend integration tests hit the real local dev database rather than mocks — deliberate, since mocking would miss exactly the kind of bugs this codebase has hit live (mysql2 type-coercion differences, schema drift). Use the helpers in `tests/helpers/testDb.js` (`testIp()`, `testHostname()`) to generate collision-free test data, and always clean up created rows in `afterEach`.
