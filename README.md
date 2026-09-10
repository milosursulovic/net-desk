<p align="center">
  <img src="frontend/src/assets/icons/netdesk.svg" alt="NetDesk" width="96" height="96" />
</p>

# NetDesk

Internal IT tool for viewing and managing network/hardware infrastructure —
IP addresses, computer metadata, printers, hardware inventory and PDSU
analytics (software, drivers, services, Windows updates), all in one place.
It has grown into a full RMM (Remote Monitoring & Management) system: the
Netdesk Agent, a Windows service installed on managed computers, reports
status/monitoring data, syncs a full hardware/software inventory, executes
remote admin commands, and updates itself via signed packages — see
[Netdesk Agent (RMM)](#netdesk-agent-rmm) below.

For in-depth technical documentation (architecture, database, API,
security) see [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

## Contents

- [Project structure](#project-structure)
- [Technologies](#technologies)
- [Features](#features)
- [Netdesk Agent (RMM)](#netdesk-agent-rmm)
- [Running locally](#running-locally)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)

## Project structure

```
net-desk/
├── backend/    Express API server (Node.js, MySQL)
├── frontend/   Vue 3 SPA (Vite, Tailwind CSS)
└── service/    Netdesk Agent — Windows service (C#, .NET Framework 4.5.2)
```

### Backend (`backend/`)

```
config/         env, CORS, SSL, logger configuration
controllers/    HTTP request/response handlers per domain
services/       business logic
repositories/   SQL queries (mysql2)
dtos/           zod schemas for input validation
middlewares/    auth, error handling, cache-control
routes/         Express router definitions
utils/          shared helpers (httpError, pagination, sqlSearch,
                exportExcel, idParam, queryCoercion, withTransaction...)
db/pool.js      MySQL connection pool
```

### Frontend (`frontend/`)

```
views/          pages (routes)
components/     shared components (AppButton, AppNav, Breadcrumbs,
                ConfirmDialog, SlideOverPanel, FormInput...)
components/pdsu/PDSU tab components (Overview/Software/Drivers/Services/Updates)
composables/    shared stateful logic (useToast, useConfirmDialog,
                usePaginatedRoute, useAbortableFetch...)
utils/          format, math, fetch/auth helpers
constants/      shared constants and form options
layouts/        MainLayout (header, nav, breadcrumbs, footer)
router/         Vue Router routes and auth guard
```

## Technologies

**Backend:** Node.js, Express 5, MySQL (mysql2), JWT authentication (bcryptjs +
jsonwebtoken), zod validation, exceljs (XLSX export), helmet, express-rate-limit.

**Frontend:** Vue 3 (Composition API, `<script setup>`), Vite, Vue Router,
Tailwind CSS 4.

**Netdesk Agent (`service/`):** C#, .NET Framework 4.5.2 (Windows 7+
support), Windows Service, WMI/registry for inventory, Newtonsoft.Json.

## Features

- **IP addresses** — computer records by IP, search/filter/sort,
  online/offline status, port scan, XLSX export
- **Metadata** — per-computer hardware details (CPU, RAM, disk, GPU, network)
  and aggregate analytics (coverage, distributions, top lists)
- **Printers** — records, linking to computers, host assignment
- **Hardware inventory** — spare parts/equipment outside the network
- **PDSU analytics** — software, drivers, services and Windows updates per
  computer, with an overview and detailed tables
- **Daily report** — auto-generated every morning at 7 (and on demand):
  fleet overview (agents online/stale/offline, IP status changes), active
  alerts, disk-fill trend (a "reaches 90% in ~N days" projection based on
  history, once enough data exists), and what's new since the previous
  report (new agents/IP addresses/printers, failed commands and updates) —
  with a history of past reports, read/unread marking, printing and a push
  notification when it's ready

## Netdesk Agent (RMM)

A Windows service (`service/`) installed on managed computers that
communicates with the backend over HTTPS, a separate stack/project from
`backend/`/`frontend/`. Covers the full RMM flow:

- **Enrollment + heartbeat + monitoring** — registration via a shared
  token, periodic heartbeat with CPU/RAM/disk/network/antivirus/firewall/
  BitLocker/temperature data
- **Full inventory sync** — hardware (CPU, RAM, disk, GPU, network,
  motherboard, BIOS), software, drivers, services, printers, installed and
  available Windows updates, via WMI and the registry
- **Remote commands** — restart/shutdown the computer, log off the user,
  start/stop/restart a service, run PowerShell scripts, delete temp
  files — the admin issues these from `AgentDetailView`, the agent pulls and
  executes them on its next poll cycle
- **Event log** — critical/error/warning entries from the Windows Event Log,
  an append-only history per computer
- **Auto-update** — the agent checks for a new version per deployment group
  (test/it/pilot/rest), downloads it, verifies the SHA-256 and (optionally)
  the package's digital signature, swaps files via a separate Updater
  process, with automatic rollback on failure
- **Alerting** — wired into the existing notification system: offline
  machines, full disk, antivirus/firewall disabled, failed jobs, the
  Windows Update service stopped
- **Push notifications (PWA)** — the frontend is installable as a Progressive
  Web App; when a new alert appears, a logged-in admin gets a push
  notification to desktop/phone even when the tab isn't open, via
  `web-push`/VAPID and a service worker (`public/push-sw.js`). The watcher
  (`pushNotificationWatcher.js`) only pushes for alerts that just appeared,
  it doesn't repeat the same alert on every cycle.

Detailed architecture, installation and configuration:
[`service/README.md`](service/README.md).
Ideas for further development (live remote access, configurable alerting,
monitoring history, RBAC, etc.): [`docs/agent-roadmap.md`](docs/agent-roadmap.md).

## Running locally

Prerequisites: Node.js, a MySQL server, an SSL cert/key for local HTTPS
(both the backend and the frontend dev server run over HTTPS).

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in the values, see below
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # fill in the values, see below
npm run dev
```

## Environment variables

### `backend/.env`

| Variable                | Description                                |
| ----------------------- | ------------------------------------------ |
| `HOST`                  | interface the server listens on            |
| `PORT`                  | backend server port                        |
| `DB_HOST`, `DB_PORT`     | MySQL host/port                            |
| `DB_USER`, `DB_PASS`     | MySQL credentials                          |
| `DB_NAME`                | database name                              |
| `JWT_SECRET`             | secret key for signing JWT tokens          |
| `AGENT_ENROLL_TOKEN`     | shared secret token for enrolling the Netdesk Agent (`service/`) |
| `AGENT_SIGNING_CERT_PATH`, `AGENT_SIGNING_KEY_PATH` | optional - PEM certificate/key for signing agent release packages (see `service/README.md`) |
| `SSL_CERT`, `SSL_KEY`    | paths to the SSL certificate for HTTPS     |
| `CORS_ALLOWED_ORIGINS`   | allowed origins, comma-separated           |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional - generated with `npx web-push generate-vapid-keys`; push notifications are disabled if not set |

### `frontend/.env`

| Variable                 | Description                                |
| ------------------------ | ------------------------------------------ |
| `VITE_API_URL`           | base URL of the backend API                |
| `VITE_HOST_IP_ADDRESS`   | interface the Vite dev server listens on   |
| `VITE_HOST_PORT`         | Vite dev server port                       |
| `VITE_SSL_KEY_PATH`      | path to the SSL key for the dev server     |
| `VITE_SSL_CERT_PATH`     | path to the SSL certificate for the dev server |

## Scripts

### Backend

| Script            | Description                    |
| ------------------ | ------------------------------ |
| `npm run dev`       | starts the server with nodemon |
| `npm start`         | starts the server (production) |

ESLint is configured (`eslint.config.js`), but there's no dedicated
`npm run lint` script — run it directly with `npx eslint .`.

### Frontend

| Script              | Description                        |
| -------------------- | ---------------------------------- |
| `npm run dev`         | starts the Vite dev server         |
| `npm run build`       | production build                   |
| `npm run preview`     | preview the production build       |
| `npm run lint`        | ESLint check                       |
| `npm run lint:fix`    | ESLint with auto-fix               |
| `npm run format`      | Prettier formatting of `src/`      |
