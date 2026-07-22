# NetDesk

Interni IT alat za pregled i upravljanje mrežnom/hardverskom infrastrukturom —
IP adrese, metapodaci računara, štampači, hardverski inventar i PDSU analitika
(softver, drajveri, servisi, Windows update-i), na jednom mestu. Prerastao je
u pun RMM (Remote Monitoring & Management) sistem: Netdesk Agent, Windows
servis koji se instalira na upravljane računare, javlja status/monitoring
podatke, sinhronizuje pun hardverski/softverski inventar, izvršava
administratorske komande na daljinu i ažurira se sam preko potpisanih
paketa — videti [Netdesk Agent (RMM)](#netdesk-agent-rmm) ispod.

Za dubinsku tehničku dokumentaciju (arhitektura, baza podataka, API,
bezbednost) videti [`docs/TECHNICAL.md`](docs/TECHNICAL.md).

## Sadržaj

- [Struktura projekta](#struktura-projekta)
- [Tehnologije](#tehnologije)
- [Funkcionalnosti](#funkcionalnosti)
- [Netdesk Agent (RMM)](#netdesk-agent-rmm)
- [Pokretanje lokalno](#pokretanje-lokalno)
- [Environment varijable](#environment-varijable)
- [Skripte](#skripte)

## Struktura projekta

```
net-desk/
├── backend/    Express API server (Node.js, MySQL)
├── frontend/   Vue 3 SPA (Vite, Tailwind CSS)
└── service/    Netdesk Agent — Windows servis (C#, .NET Framework 4.5.2)
```

### Backend (`backend/`)

```
config/         env, CORS, SSL, logger konfiguracija
controllers/    HTTP request/response handleri po domenu
services/       poslovna logika
repositories/   SQL upiti (mysql2)
dtos/           zod šeme za validaciju ulaza
middlewares/    auth, error handling, cache-control
routes/         Express router definicije
utils/          deljeni helperi (httpError, pagination, sqlSearch,
                exportExcel, idParam, queryCoercion, withTransaction...)
db/pool.js      MySQL connection pool
```

### Frontend (`frontend/`)

```
views/          stranice (rute)
components/     deljene komponente (AppButton, AppNav, Breadcrumbs,
                ConfirmDialog, SlideOverPanel, FormInput...)
components/pdsu/PDSU tab komponente (Overview/Software/Drivers/Services/Updates)
composables/    deljena stateful logika (useToast, useConfirmDialog,
                usePaginatedRoute, useAbortableFetch...)
utils/          format, math, fetch/auth helperi
constants/      deljene konstante i opcije formi
layouts/        MainLayout (header, nav, breadcrumbs, footer)
router/         Vue Router rute i auth guard
```

## Tehnologije

**Backend:** Node.js, Express 5, MySQL (mysql2), JWT autentikacija (bcryptjs +
jsonwebtoken), zod validacija, exceljs (XLSX export), helmet, express-rate-limit.

**Frontend:** Vue 3 (Composition API, `<script setup>`), Vite, Vue Router,
Tailwind CSS 4.

**Netdesk Agent (`service/`):** C#, .NET Framework 4.5.2 (Windows 7+
podrška), Windows Service, WMI/registry za inventar, Newtonsoft.Json.

## Funkcionalnosti

- **IP adrese** — evidencija računara po IP-u, pretraga/filter/sortiranje,
  online/offline status, port scan, XLSX export
- **Metapodaci** — hardverski detalji po računaru (CPU, RAM, disk, GPU, mreža)
  i agregatna analitika (pokrivenost, distribucije, top liste)
- **Štampači** — evidencija, povezivanje na računare, host dodela
- **Inventar hardvera** — rezervni delovi/oprema van mreže
- **PDSU analitika** — softver, drajveri, servisi i Windows update-i po
  računaru, sa pregledom i detaljnim tabelama
- **Dnevni izveštaj** — automatski generisan svako jutro u 7 (i ručno na
  zahtev): pregled flote (agenti online/stale/offline, IP status promene),
  aktivna upozorenja, trend punjenja diska (projekcija "stiže do 90% za ~N
  dana" na osnovu istorije, kad ima dovoljno podataka), i šta je novo od
  prethodnog izveštaja (novi agenti/IP adrese/štampači, neuspešne komande i
  ažuriranja) — sa istorijom prethodnih izveštaja, oznakom pročitano/
  nepročitano, štampanjem i push notifikacijom kad je spreman

## Netdesk Agent (RMM)

Windows servis (`service/`) koji se instalira na upravljane računare i
komunicira sa backend-om preko HTTPS-a, odvojen stek/projekat od
`backend/`/`frontend/`. Pokriva ceo RMM tok:

- **Enrollment + heartbeat + monitoring** — registracija preko deljenog
  tokena, periodičan heartbeat sa CPU/RAM/disk/mreža/antivirus/firewall/
  BitLocker/temperatura podacima
- **Pun inventory sync** — hardver (CPU, RAM, disk, GPU, mreža, matična
  ploča, BIOS), softver, drajveri, servisi, štampači, instalirani i dostupni
  Windows update-i, preko WMI-ja i registry-ja
- **Remote komande** — restart/shutdown računara, odjava korisnika,
  start/stop/restart servisa, izvršavanje PowerShell skripti, brisanje temp
  fajlova — admin zadaje iz `AgentDetailView`, agent ih povlači i izvršava
  na sledećem poll ciklusu
- **Event log** — kritični/error/warning zapisi iz Windows Event Log-a,
  append-only istorija po računaru
- **Auto-update** — agent proverava novu verziju po deployment grupi
  (test/it/pilot/rest), preuzima, proverava SHA-256 i (opciono) digitalni
  potpis paketa, zamenjuje fajlove preko odvojenog Updater procesa, sa
  automatskim rollback-om pri neuspehu
- **Alerting** — spojeno sa postojećim notifikacionim sistemom: offline
  mašine, pun disk, isključen antivirus/firewall, neuspeli jobovi, stao
  Windows Update servis
- **Push notifikacije (PWA)** — frontend je instalabilan kao Progressive Web
  App; kad se pojavi nov alarm, prijavljeni admin dobija push notifikaciju na
  desktop/telefon i kad tab nije otvoren, preko `web-push`/VAPID-a i
  service worker-a (`public/push-sw.js`). Watcher (`pushNotificationWatcher.js`)
  šalje push samo za alarme koji se TEK pojave, ne ponavlja isti alarm na
  svaki ciklus.

Detaljna arhitektura, instalacija i konfiguracija: [`service/README.md`](service/README.md).
Ideje za dalji razvoj (uživo remote pristup, konfigurabilan alerting,
istorija monitoringa, RBAC, itd.): [`docs/agent-roadmap.md`](docs/agent-roadmap.md).

## Pokretanje lokalno

Preduslovi: Node.js, MySQL server, SSL cert/key za lokalni HTTPS (i backend i
frontend dev server rade preko HTTPS).

### Backend

```bash
cd backend
npm install
cp .env.example .env   # popuni vrednosti, vidi ispod
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # popuni vrednosti, vidi ispod
npm run dev
```

## Environment varijable

### `backend/.env`

| Varijabla              | Opis                                       |
| ----------------------- | ------------------------------------------ |
| `HOST`                  | interfejs na kom server sluša              |
| `PORT`                  | port backend servera                       |
| `DB_HOST`, `DB_PORT`     | MySQL host/port                            |
| `DB_USER`, `DB_PASS`     | MySQL kredencijali                         |
| `DB_NAME`                | naziv baze                                 |
| `JWT_SECRET`             | tajni ključ za potpisivanje JWT tokena     |
| `AGENT_ENROLL_TOKEN`     | deljeni tajni token za registraciju Netdesk Agent-a (`service/`) |
| `AGENT_SIGNING_CERT_PATH`, `AGENT_SIGNING_KEY_PATH` | opciono - PEM sertifikat/ključ za potpisivanje agent release paketa (videti `service/README.md`) |
| `SSL_CERT`, `SSL_KEY`    | putanje do SSL sertifikata za HTTPS        |
| `CORS_ALLOWED_ORIGINS`   | dozvoljeni origin-i, odvojeni zarezom      |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | opciono - generiše se sa `npx web-push generate-vapid-keys`; ako nisu podešeni, push notifikacije su isključene |

### `frontend/.env`

| Varijabla               | Opis                                      |
| ------------------------ | ------------------------------------------ |
| `VITE_API_URL`           | bazni URL backend API-ja                  |
| `VITE_HOST_IP_ADDRESS`   | interfejs na kom Vite dev server sluša    |
| `VITE_HOST_PORT`         | port Vite dev servera                     |
| `VITE_SSL_KEY_PATH`      | putanja do SSL ključa za dev server       |
| `VITE_SSL_CERT_PATH`     | putanja do SSL sertifikata za dev server  |

## Skripte

### Backend

| Skripta         | Opis                          |
| ---------------- | ------------------------------ |
| `npm run dev`     | pokreće server sa nodemon-om  |
| `npm start`       | pokreće server (produkcija)   |

ESLint je konfigurisan (`eslint.config.js`), ali nema definisanu `npm run lint`
skriptu — pokreće se direktno sa `npx eslint .`.

### Frontend

| Skripta            | Opis                              |
| -------------------- | ---------------------------------- |
| `npm run dev`         | pokreće Vite dev server           |
| `npm run build`       | produkcioni build                 |
| `npm run preview`     | pregled produkcionog build-a      |
| `npm run lint`        | ESLint provera                    |
| `npm run lint:fix`    | ESLint sa auto-fix-om             |
| `npm run format`      | Prettier formatiranje `src/`      |
