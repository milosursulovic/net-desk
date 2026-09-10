# NetDesk — technical documentation

This document is an in-depth technical overview of the whole system —
architecture, database, backend/frontend/agent layers, background processes
and security measures. For a quick start (installation, env variables,
scripts) see [`README.md`](../README.md). For ideas on further development
see [`agent-roadmap.md`](agent-roadmap.md).

## Contents

- [System overview](#system-overview)
- [Architecture](#architecture)
- [Backend](#backend)
- [Database](#database)
- [Frontend](#frontend)
- [Netdesk Agent (Windows Service)](#netdesk-agent-windows-service)
- [Configuration / feature flags](#configuration--feature-flags)
- [API overview](#api-overview)
- [Deployment](#deployment)
- [Background processes](#background-processes)
- [Security](#security)
- [Known limitations](#known-limitations)

## System overview

NetDesk is an internal IT tool that has grown into a full RMM (Remote
Monitoring & Management) system. It consists of three independent parts:

1. **Backend** (`backend/`) — Node.js/Express REST API, MySQL/MariaDB
   database. The only part that talks to the database directly.
2. **Frontend** (`frontend/`) — Vue 3 SPA/PWA, consumes the backend REST API.
   The single admin console for the whole system.
3. **Netdesk Agent** (`service/`) — C#/.NET Framework 4.5.2 Windows service,
   installed on every managed computer, talks to the backend over its own
   REST API (separate from the admin API).

The system covers two broad areas:

- **Manual/PDSU infrastructure records** — IP addresses, printers, hardware
  inventory outside the network, per-computer software/drivers/services/
  updates (the historical, first part of the project, still active).
- **RMM via the agent** — enrollment, heartbeat, monitoring, full
  hardware/software inventory, remote commands, auto-update, event log,
  daily reports with trend detection, push notifications.

## Architecture

```
┌─────────────────┐        HTTPS (JWT)         ┌──────────────────┐
│   Frontend       │ ─────────────────────────▶ │                  │
│   Vue 3 PWA      │ ◀───────────────────────── │                  │
└─────────────────┘        REST API              │                  │
                                                  │    Backend       │
┌─────────────────┐   HTTPS (Bearer agentId:key)│  Node/Express    │        ┌──────────┐
│  Netdesk Agent   │ ─────────────────────────▶ │                  │ ─────▶ │  MySQL/  │
│  (every managed  │ ◀───────────────────────── │                  │ ◀───── │ MariaDB  │
│   computer)       │   REST API (enroll/hb/jobs)│                  │        └──────────┘
└─────────────────┘                              └──────────────────┘
                                                          │
                                                          ▼
                                                   Web Push (VAPID)
                                                          │
                                                          ▼
                                                  Browser/PWA (push
                                                  notifications to the user)
```

Two completely separate auth models coexist in the same backend process:

- **Users (admin)** — JWT (`Authorization: Bearer <jwt>`), issued via
  `POST /api/auth/login`, checked by the `authenticateToken` middleware on
  all `/api/protected/*` routes.
- **Agents** — a static per-agent API key (`Authorization: Bearer
  <agentId>:<apiKey>`), hash stored in the database (`agents.api_key_hash`),
  checked by `agentAuth.middleware.js` on `/api/agents/*` routes. Enrollment
  itself (`POST /api/agents/enroll`) is gated by a separate shared token
  (`AGENT_ENROLL_TOKEN`), not the agent key (the agent doesn't have one yet).

## Backend

### Stack

Node.js, Express 5, MySQL (`mysql2`, raw SQL — no ORM), `zod` for input
validation, `bcryptjs`+`jsonwebtoken` for auth, `web-push` for push
notifications, `exceljs` for XLSX export, `helmet`+`express-rate-limit` for
baseline security, `multer` for agent release package uploads.

### Layers

Strict layered architecture, in every domain:

```
routes/         → Express router definitions, path → controller mapping
controllers/    → parses/validates HTTP input (query/body/params),
                  calls the service, shapes the HTTP response
services/       → business logic, orchestrates multiple repositories
repositories/   → SQL queries (mysql2), the only layer aware of tables/columns
dtos/           → zod schemas for request body validation
middlewares/    → auth (user/agent), error handling, cache-control
utils/          → shared helpers with no dependency on Express
```

Controllers never write SQL queries directly; repositories never know about
`req`/`res`. This rule is applied consistently across the whole backend.

### Route structure (`routes/index.js`)

```
/api/auth/*              — login (no auth)
/api/agents/*             — agent-facing API (agent API key auth)
/api/protected/*          — admin API (JWT auth), contains everything else:
  ip-addresses/, metadata/, pdsu/, pdsu-analytics/, printers/,
  inventory/, notifications/, agents/ (admin view), agent-releases/,
  push/, reports/
```

### Key domains

| Domain | What it covers |
|---|---|
| **ip-addresses** | Records of computers/devices by IP, search/filter/sort, online/offline status (tracked by the `ping` service), port scan, duplicate names, XLSX export |
| **metadata** | Per-computer hardware details (CPU/RAM/disk/GPU/network/BIOS/motherboard), aggregate analytics (coverage, distributions, top lists, red flags), search across the whole database |
| **printers** | Printer records, host/connected-computer links, XLSX export |
| **inventory** | Spare parts/equipment outside the network (not PDSU, no link to ip_entries) |
| **pdsu / pdsu-analytics** | Software, drivers, services, Windows updates per computer (manual or via the agent), and aggregate analytics over all of it |
| **agents (admin)** | Agent listing/filtering/details, deployment groups, revoke |
| **agent-releases** | Uploading/activating agent versions for auto-update, package signing |
| **push** | Web push subscriptions (subscribe/unsubscribe), public VAPID key |
| **reports** | Daily report — generation, reading, history, read/unread |
| **notifications** | Aggregation of all active alerts (offline, disk full, AV/FW disabled, etc.) — used both for the UI ticker and the daily report |

### Agent-facing API (`/api/agents/*`)

```
POST /enroll                        — registration (enroll token auth)
POST /heartbeat                     — periodic heartbeat + monitoring payload
GET  /ping                          — side-effect-free connection test
POST /inventory                     — full/partial inventory sync (merge semantics)
GET  /jobs                          — agent pulls pending commands
POST /jobs/:jobId/result            — agent reports a command's result
GET  /update                        — checks for a new version (per deployment group)
GET  /update/download/:releaseId    — downloads the package
POST /update/report                 — reports update success/failure
```

**Important semantics:** `POST /inventory` uses merge/patch logic
(`patchMetadataForIpEntry`), NOT a raw upsert — a field the agent doesn't
send in a given sync is left untouched. This exists because the agent also
sends "minimal" syncs (e.g. event log only), which must not wipe previously
synced hardware data. The `software`/`drivers`/`services`/`updates` arrays
are the exception — those are deliberately full-replace-on-send (the agent
sends its complete current list, old rows are deleted).

## Database

The schema is applied via `backend/migrations/*.sql` (numbered files,
`NNNN_description.sql`, applied in filename order) + `npm run migrate`
(`backend/scripts/migrate.js`) — a `schema_migrations` table tracks which
file has already been applied, so re-running is safe (only new files run).
Table groups:

**Manual/PDSU records:**
`ip_entries`, `ip_status_history`, `printers`, `printer_connected_computers`,
`inventory_items`

**Computer metadata (both manual and via the agent):**
`computer_metadata` + child tables `computer_metadata_storage`,
`computer_metadata_gpus`, `computer_metadata_nics`,
`computer_metadata_ram_modules`

**PDSU (both manual and via the agent):**
`computer_software`, `computer_drivers`, `computer_services`,
`computer_updates`, `computer_available_updates`, `computer_printers`,
`computer_event_logs` (the only append-only one — the others are
delete+reinsert on every sync)

**RMM/agents:**
`agents`, `agent_monitoring` (1:1 upsert-latest snapshot),
`agent_monitoring_history` (daily snapshot, used for trend/anomaly
analysis — see below), `agent_jobs`, `agent_releases`, `agent_update_log`,
`vnc_sessions` (remote-screen-control lifecycle — see below)

**Daily report and push:**
`daily_reports` (JSON content, `opened_at` for read/unread),
`push_subscriptions`

**Auth:**
`users`

All tables use `id INT AUTO_INCREMENT` primary keys and `utf8mb4`. FKs to
`agents.id` consistently use `ON DELETE CASCADE` (deleting an agent also
deletes its monitoring/history/jobs).

## Frontend

### Stack

Vue 3 (Composition API, `<script setup>`), Vite, Vue Router, Tailwind CSS 4,
`vite-plugin-pwa` (PWA manifest + service worker), `xlsx` for export.

### Structure

```
views/          — pages (routes), one file per page
components/     — shared components (AppButton, ConfirmDialog,
                  SlideOverPanel, ThemeToggle, PushNotificationToggle...)
components/pdsu/— PDSU tab components (Overview/Software/Drivers/
                  Services/Updates)
composables/    — shared stateful logic (usePaginatedRoute,
                  useAbortableFetch, useTheme, usePushNotifications...)
utils/          — format, math, fetch/auth helpers
layouts/        — MainLayout (header, nav, breadcrumbs, footer)
router/         — routes + auth guard
```

### Vue-specific notes

- `MetadataView.vue` contains a few small chart/widget components defined
  inline via `defineComponent`+`h()` (render functions) instead of separate
  `.vue` files — deliberate, for locality (only used within that file).
- The `usePaginatedRoute` composable syncs filter/pagination state with
  `route.query` — used consistently across every listing page (Home,
  Agents, Inventory, Printers...), so every filter is reflected in the URL
  and can be shared/bookmarked.

### PWA and push notifications

The app is installable as a Progressive Web App (`vite-plugin-pwa`,
`generateSW` strategy). `public/push-sw.js` is imported into the
auto-generated service worker via `workbox.importScripts` and adds `push`/
`notificationclick` listeners. The `usePushNotifications.js` composable
manages subscribe/unsubscribe via the browser Push API, with keys coming
from the backend (`GET /api/protected/push/public-key`).

**iOS note:** Web Push only works from iOS 16.4, and only if the page has
previously been added to the home screen ("Add to Home Screen") — on
Android it works without that.

### Dark theme

Class-based (`@custom-variant dark`, Tailwind v4), not just
`prefers-color-scheme`. The `useTheme.js` composable manages the
light/dark/system choice, persists it in `localStorage`, and `index.html`
has an inline script that applies the theme BEFORE the page's first paint
(avoids a light→dark flash).

Instead of manually adding `dark:` variants across dozens of files, the
whole dark theme is implemented **centrally in `main.css`** — by remapping
the utility classes the app already uses consistently (`bg-white`,
`text-slate-*`, `bg-slate-50/100`, status chip triplets like
`bg-emerald-50`/`text-emerald-700`/`border-emerald-200`) to dark
equivalents under a `.dark` selector. Saturated colors (buttons, solid
status badges, chart segment colors) are deliberately left untouched —
they already work well on a dark background.

### Mobile UX

The nav bar and tab rows (Agent details, PDSU inventory) switch to
horizontal scroll below the `sm` breakpoint instead of wrapping into
multiple rows. Dense filter bars (Home, Agents, Inventory) collapse behind
a "Filters" button with an active-filter-count badge on mobile, while
search/stats/pagination stay always visible.

## Netdesk Agent (Windows Service)

### Stack

C#, .NET Framework 4.5.2 (deliberately — the goal is Windows 7 SP1+ support
without installing anything newer). SDK-style `.csproj` projects.
Newtonsoft.Json for (de)serialization, with
`CamelCaseNamingStrategy { OverrideSpecifiedNames = false }` (not the
standard `CamelCasePropertyNamesContractResolver` — that one silently
overrides explicit `[JsonProperty]` names).

### Structure

```
Netdesk.Agent.Common/
  Configuration/   — AgentSettings, AgentState, Paths
  Http/            — NetdeskApiClient (HTTP wrapper), auth headers
  Inventory/       — HardwareCollector, SoftwareCollector, DriverCollector,
                     ServiceCollector, WindowsUpdateCollector
  Monitoring/      — MonitoringCollector (CPU/RAM/disk/AV/FW/BitLocker/temp)
  Jobs/            — JobExecutor, ProcessRunner
  EventLogs/       — EventLogCollector, EventLogBookmarks (append-only sync)
  Update/          — UpdateManager (check→download→verify→launch Updater)
  Logging/         — FileLogger

Netdesk.Agent.Service/    — Netdesk.Agent.Service.exe, Windows Service or
                             --console debug mode, same AgentWorker loop
Netdesk.Agent.Updater/    — separate process, physically swaps the service's
                             files (a running process can't overwrite its
                             own files on Windows)
```

### Install layout (relevant to auto-update)

```
C:\Program Files\NetdeskAgent\
├── Service\    — overwritten on every auto-update
└── Updater\    — DELIBERATELY separate folder, never overwritten
```

### Key features

- **Enrollment + heartbeat** — registers once (shared enroll token →
  permanent `agentId`+`apiKey`), then a periodic heartbeat (30s by default)
  with a monitoring payload.
- **Monitoring** — CPU/RAM/disk via WMI, antivirus via
  `root\SecurityCenter2`, firewall via the registry (deliberately not
  `netsh` parsing — breaks on non-English Windows localizations),
  BitLocker/temperature best-effort (often unavailable depending on the
  OEM).
- **Inventory sync** — hardware, software (registry Uninstall keys, not
  `Win32_Product` — that triggers a slow MSI repair), drivers, services,
  installed and available Windows updates (the latter via COM,
  `Microsoft.Update.Session` — WMI has no visibility into pending updates).
- **Job execution** — 8 of 10 command types execute directly
  (restart/shutdown/logoff via `shutdown.exe` with a 15s delay so the HTTP
  result arrives before shutdown; logoff via the WTS API since
  `shutdown /l` doesn't work from a LocalSystem service),
  `collect_inventory`/`refresh_software_list` go through the
  `InventoryCollector`.
- **Auto-update** — checks the version per deployment group → downloads →
  SHA-256 check → (optionally) verifies the digital signature via a chain
  to an internal root CA → launches the Updater → the Updater swaps files
  and restarts the service, with automatic rollback on any exception.
- **Remote screen control (VNC, behind the `vnc_enabled` feature flag)** —
  the agent itself doesn't do capture/injection, it's just a thin
  TCP↔WebSocket "byte forwarder" (`Vnc/VncBridge.cs`) between the local
  UltraVNC server (127.0.0.1, a separate Windows service, outside the
  scope of this repo) and the backend relay. See `service/README.md`.

More detailed architecture, build prerequisites, and all the "gotchas"
learned during development (TLS 1.2 on Win7, JSON contract resolver traps,
etc.) are in [`service/README.md`](../service/README.md).

## Configuration / feature flags

A generic registry of toggleable settings (`app_settings` table, key/value
rows) - `backend/dtos/appSettings.dto.js`'s `APP_SETTINGS` list is the only
place that needs to be extended for a new checkbox (label, description,
default) - the repository/service/controller/`/config` frontend page are
generic and pick it up automatically, with no per-setting code. Admin-only
for both reading and writing (`/api/protected/settings`) - which features
are enabled is itself administrative information, the same logic as
`users.routes.js`/`activityLog.routes.js`. Other services check a flag via
`appSettings.service.js`'s `isFeatureEnabled(key)` helper. Currently
registered: `vnc_enabled` (enables "Take screen control" on the agent
page — see the Netdesk Agent section above), `process_monitor_enabled`
(global kill switch for the watchlist-process killer), and `app_language`
(a `"select"`-type setting — the application's UI language, shown as a
dropdown on the Konfiguracija page instead of a boolean toggle; readable
without auth via `GET /api/language` since the login screen itself needs it
before a JWT exists).

## API overview

The full list of routes per domain is in the corresponding
`routes/*.routes.js` files. Common patterns across the whole API:

- All lists are paginated (`page`/`limit` query, `{ items, page, limit,
  total, totalPages }` response).
- Filter query parameters that fail validation (e.g. an unknown enum) are
  **silently ignored**, not rejected with 400 — only an explicitly invalid
  request body shape (a zod `safeParse` failure) returns 400.
- Routes that could be wrongly swallowed by a `/:id` route (e.g.
  `/agents/filter-options`, `/reports/latest`) are deliberately registered
  BEFORE the `/:id` route in the router file — this is covered by
  regression tests (`http.routes.test.js`) after at least two real
  incidents of this kind.
- The `cacheNoStore` middleware is applied to every `/api/protected/*`
  group — admin data is never cached in the browser.

## Deployment

**Local dev** — two ports, two processes: the Vite dev server (frontend,
`:5174` by default) and Express (backend, `:3000`), `VITE_API_URL` in
`frontend/.env` is the full URL to the backend (e.g.
`https://localhost:3000`) since they're on different origins —
`CORS_ALLOWED_ORIGINS` must include the frontend's origin.

**Production** — one port, one process: after `npm run build` in
`frontend/`, the backend (`app.js`) itself serves the `frontend/dist/`
files (`express.static` + an SPA fallback route that returns `index.html`
for every GET that isn't under `/api/*` — Vue Router has its own catch-all
that then takes over and shows a 404 on the client). `VITE_API_URL` in the
production `.env` should be **empty** (relative calls, same origin). This
behavior is conditioned on whether `frontend/dist/index.html` actually
exists on disk — if it doesn't (e.g. local dev without a build), the
backend behaves identically to before (only `/api/*`, everything else
404), so this doesn't change the local dev workflow or require a build for
ordinary backend testing.

Advantage: only one port needs to be exposed externally/through the
firewall (instead of two), the agent-facing API (`/api/agents/*`) stays
completely unchanged in both scenarios.

The production `.env` must have `NODE_ENV=production` — the HSTS header
(`helmet`) and the CORS "deny-by-default" behavior depend on it (see
Security below). Without this, the backend behaves like dev even in
production.

`CORS_ALLOWED_ORIGINS` must include the backend's own origin (e.g.
`https://10.230.62.81:3000`) even when it serves the frontend itself — the
browser sends an `Origin` header on same-origin fetch/XHR calls too, and
the check in `config/cors.js` makes no exception for that, it just compares
against the allowlist. An empty list in production also rejects the
frontend's own calls.

## Background processes

The backend starts three long-running processes on startup (`server.js`),
each with a self-rescheduling `setTimeout` loop (not `setInterval` — avoids
drift and lets each tick wait for the previous one to finish):

| Process | Interval | What it does |
|---|---|---|
| `pingService.js` | 30s (configured) | ICMP ping of all `ip_entries`, writes online/offline status and change history |
| `pushNotificationWatcher.js` | 60s | Compares the current set of active alerts against the previous tick, sends a push ONLY for newly-appeared ones (doesn't repeat the same alert every cycle) |
| `dailyReportScheduler.js` | daily at 7:00 (self-rescheduling, DST-safe) | Generates the daily report, records a monitoring snapshot, sends a push |

**Trend and anomaly analysis** (`utils/trendAnalysis.js`, pure functions
with no I/O) — on every daily report generation, for each agent, over the
last 90 days of `agent_monitoring_history` (disk/CPU/RAM), it computes:
- **Threshold projection** (linear regression) — "reaches 90% in ~N days"
  per metric; returns `null` for a flat/decreasing trend, too few data
  points, or a value already above the threshold (that's covered by the
  existing alert, not the trend).
- **Anomaly** (z-score) — today's value against the agent's own historical
  mean/standard deviation (excluding today's point) — catches a one-off
  spike/drop that linear regression doesn't see, regardless of trend.
  Two-sided (both unusually low and unusually high), threshold `|z| >= 3`,
  minimum 7 points for the baseline.

## Security

- **Passwords** — bcrypt hash (`bcryptjs`), with a lenient migration from
  legacy plaintext passwords (checks for a plaintext match, and if it
  succeeds, immediately re-hashes it).
- **Agent API keys** — SHA-256 hash in the database (not plaintext),
  compared via `crypto.timingSafeEqual` (constant-time, prevents timing
  attacks).
- **SQL injection** — all queries are parameterized (`mysql2` placeholders);
  where an `ORDER BY` column must be interpolated (can't be parameterized),
  an explicit allowlist is used (`SORT_FIELDS`/`sortMap`) — never raw user
  input.
- **CORS** — an explicit origin allowlist (`CORS_ALLOWED_ORIGINS`),
  including the backend's own origin when it serves the frontend itself
  (the browser sends an `Origin` header on same-origin calls too); in
  production (`NODE_ENV=production`) an empty list means no origin is
  allowed, not even its own (in dev mode, an empty list = allow everything,
  for easier local work) — which is why `NODE_ENV=production` is mandatory
  in production, otherwise an empty list accidentally means "allow
  everything".
- **Rate limiting** — `express-rate-limit`, `trust proxy` explicitly
  disabled (prevents X-Forwarded-For spoofing unless a real reverse proxy
  sits in front, in which case it should be deliberately enabled).
- **SSRF protection** — the port scan feature checks that the IP isn't in a
  private range before scanning (anti-SSRF guard).
- **Web Push** — VAPID keys, fully optional (without them, the subscribe
  endpoint still exists but the watcher sends nothing).
- **Agent update packages** — the SHA-256 is computed server-side from the
  actually uploaded bytes (the client is never trusted), with optional
  RSA-SHA256 signing via an internal CA.
- **RBAC** — three roles (`admin`/`operator`/`viewer`) in `users.role`. The
  default policy (`middlewares/requireRole.middleware.js`): GET is open to
  every role, anything that changes state requires at least `operator`.
  Admin-only: Users management and Agent Releases (uploading/activating a
  version - affects the whole fleet). Exceptions where `viewer` is still
  allowed: push subscribe/unsubscribe and report mark-read (personal
  actions, not organizational mutations).
- **Audit log** (`activity_log` table) — a generic HTTP-level trail: every
  non-GET request to `/api/protected/*` (regardless of outcome - even
  403/400 are logged), plus GET requests that look at one specific record
  (the path ends in a number, e.g. `/agents/47` - lists/search/pagination
  aren't logged), plus `login_success`/`login_failed` with the IP address.
  Visible only to the admin at `/logs`. Logging is fire-and-forget
  (`res.on("finish")`, errors are swallowed) - it must never break the
  actual request.

## Known limitations

- The baseline schema (the state before `backend/migrations/` was
  introduced) isn't recorded as SQL anywhere, it only exists as
  already-applied state on the live database — only incremental changes
  from migration `0001` onward are in the repo. Reproducing the whole
  schema from scratch (e.g. for Docker/a new host) requires first
  generating a baseline dump from the live database.
- The job queue is async/polling (the agent pulls on its next cycle, not
  immediately) — there's no live/real-time channel for commands.

For a broader look at ideas for the next version (including considering a
mobile app and local AI), see [`agent-roadmap.md`](agent-roadmap.md).
