# NetDesk — tehnička dokumentacija

Ovaj dokument je dubinski tehnički pregled celog sistema — arhitektura, baza
podataka, backend/frontend/agent slojevi, pozadinski procesi i bezbednosne
mere. Za brzi start (instalacija, env varijable, skripte) videti
[`README.md`](../README.md). Za ideje o daljem razvoju videti
[`agent-roadmap.md`](agent-roadmap.md).

## Sadržaj

- [Pregled sistema](#pregled-sistema)
- [Arhitektura](#arhitektura)
- [Backend](#backend)
- [Baza podataka](#baza-podataka)
- [Frontend](#frontend)
- [Netdesk Agent (Windows Service)](#netdesk-agent-windows-service)
- [Remote screen control (VNC)](#remote-screen-control-vnc)
- [Konfiguracija / feature flags](#konfiguracija--feature-flags)
- [API pregled](#api-pregled)
- [Deployment](#deployment)
- [Pozadinski procesi](#pozadinski-procesi)
- [Bezbednost](#bezbednost)
- [Poznata ograničenja](#poznata-ograničenja)

## Pregled sistema

NetDesk je interni IT alat koji je prerastao u pun RMM (Remote Monitoring &
Management) sistem. Sastoji se od tri nezavisna dela:

1. **Backend** (`backend/`) — Node.js/Express REST API, MySQL/MariaDB baza.
   Jedini deo koji direktno govori sa bazom.
2. **Frontend** (`frontend/`) — Vue 3 SPA/PWA, konzumira backend REST API.
   Jedina admin konzola za ceo sistem.
3. **Netdesk Agent** (`service/`) — C#/.NET Framework 4.5.2 Windows servis,
   instalira se na svaki upravljani računar, govori sa backend-om preko
   sopstvenog REST API-ja (odvojenog od admin API-ja).

Sistem pokriva dve široke oblasti:

- **Ručna/PDSU evidencija infrastrukture** — IP adrese, štampači, hardverski
  inventar van mreže, softver/drajveri/servisi/update-i po računaru
  (istorijski, prvi deo projekta, i dalje aktivan).
- **RMM preko agenta** — enrollment, heartbeat, monitoring, potpuni
  hardverski/softverski inventar, komande na daljinu, auto-update, event
  log, dnevni izveštaji sa trend detekcijom, push notifikacije.

## Arhitektura

```
┌─────────────────┐        HTTPS (JWT)         ┌──────────────────┐
│   Frontend       │ ─────────────────────────▶ │                  │
│   Vue 3 PWA      │ ◀───────────────────────── │                  │
└─────────────────┘        REST API              │                  │
                                                  │    Backend       │
┌─────────────────┐   HTTPS (Bearer agentId:key)│  Node/Express    │        ┌──────────┐
│  Netdesk Agent   │ ─────────────────────────▶ │                  │ ─────▶ │  MySQL/  │
│  (svaki upravljani│ ◀───────────────────────── │                  │ ◀───── │ MariaDB  │
│   računar)        │   REST API (enroll/hb/jobs)│                  │        └──────────┘
└─────────────────┘                              └──────────────────┘
                                                          │
                                                          ▼
                                                   Web Push (VAPID)
                                                          │
                                                          ▼
                                                  Browser/PWA (push
                                                  notifikacije korisniku)
```

Dva potpuno odvojena auth modela postoje uporedo u istom backend procesu:

- **Korisnici (admin)** — JWT (`Authorization: Bearer <jwt>`), izdat preko
  `POST /api/auth/login`, proverava se `authenticateToken` middleware-om na
  svim `/api/protected/*` rutama.
- **Agenti** — statičan API ključ po agentu (`Authorization: Bearer
  <agentId>:<apiKey>`), hash čuvan u bazi (`agents.api_key_hash`), proverava
  se `agentAuth.middleware.js`-om na `/api/agents/*` rutama. Sam enrollment
  (`POST /api/agents/enroll`) gatovan je posebnim deljenim tokenom
  (`AGENT_ENROLL_TOKEN`), ne agentskim ključem (agent ga još nema).

## Backend

### Stek

Node.js, Express 5, MySQL (`mysql2`, raw SQL — nema ORM-a), `zod` za
validaciju ulaza, `bcryptjs`+`jsonwebtoken` za auth, `web-push` za push
notifikacije, `exceljs` za XLSX export, `helmet`+`express-rate-limit` za
osnovnu bezbednost, `multer` za upload agent release paketa.

### Slojevi

Striktna slojevita arhitektura, u svakom domenu:

```
routes/         → Express router definicije, mapiranje path → controller
controllers/    → parsiranje/validacija HTTP ulaza (query/body/params),
                  poziva service, formira HTTP odgovor
services/       → poslovna logika, orkestracija više repozitorijuma
repositories/   → SQL upiti (mysql2), jedini sloj koji zna za tabele/kolone
dtos/           → zod šeme za validaciju tela zahteva
middlewares/    → auth (korisnik/agent), error handling, cache-control
utils/          → deljeni helperi bez zavisnosti od Express-a
```

Kontroleri nikad ne prave SQL upite direktno; repozitorijumi nikad ne znaju
za `req`/`res`. Ovo pravilo je dosledno primenjeno kroz ceo backend.

### Struktura ruta (`routes/index.js`)

```
/api/auth/*              — login (bez auth-a)
/api/agents/*             — agent-facing API (agent API key auth)
/api/protected/*          — admin API (JWT auth), sadrži sve ostalo:
  ip-addresses/, metadata/, pdsu/, pdsu-analytics/, printers/,
  inventory/, notifications/, agents/ (admin pregled), agent-releases/,
  push/, reports/
```

### Ključni domeni

| Domen | Šta pokriva |
|---|---|
| **ip-addresses** | Evidencija računara/aparata po IP-u, pretraga/filter/sort, online/offline status (praćen `ping` servisom), port scan, duplirana imena, XLSX export |
| **metadata** | Hardverski detalji po računaru (CPU/RAM/disk/GPU/mreža/BIOS/matična), agregatna analitika (pokrivenost, distribucije, top liste, red-flags), pretraga preko cele baze |
| **printers** | Evidencija štampača, host/connected-computer veze, XLSX export |
| **inventory** | Rezervni delovi/oprema van mreže (nije PDSU, nema vezu sa ip_entries) |
| **pdsu / pdsu-analytics** | Softver, drajveri, servisi, Windows update-i po računaru (ručni ili preko agenta), i agregatna analitika nad svim tim |
| **agents (admin)** | Pregled/filter/detalji agenata, deployment grupe, revoke |
| **agent-releases** | Upload/aktivacija verzija agenta za auto-update, potpisivanje paketa |
| **push** | Web push pretplate (subscribe/unsubscribe), javni VAPID ključ |
| **reports** | Dnevni izveštaj — generisanje, čitanje, istorija, pročitano/nepročitano |
| **notifications** | Agregacija svih aktivnih upozorenja (offline, disk pun, AV/FW isključen, itd.) — koristi se i za UI ticker i za dnevni izveštaj |

### Agent-facing API (`/api/agents/*`)

```
POST /enroll                        — registracija (enroll token auth)
POST /heartbeat                     — periodičan heartbeat + monitoring payload
GET  /ping                          — side-effect-free connection test
POST /inventory                     — pun/delimičan inventory sync (merge semantika)
GET  /jobs                          — agent povlači pending komande
POST /jobs/:jobId/result            — agent prijavljuje rezultat komande
GET  /update                        — provera nove verzije (po deployment grupi)
GET  /update/download/:releaseId    — preuzimanje paketa
POST /update/report                 — prijava uspeha/neuspeha ažuriranja
```

**Bitna semantika:** `POST /inventory` koristi merge/patch logiku
(`patchMetadataForIpEntry`), NE raw upsert — polje koje agent ne pošalje u
datom sync-u ostaje netaknuto. Ovo postoji jer agent šalje i "minimalne"
sync-ove (npr. samo event log), koji ne bi smeli da obrišu prethodno
sinhronizovane hardverske podatke. `software`/`drivers`/`services`/`updates`
nizovi su izuzetak — to su namerno full-replace-on-send (agent šalje
kompletnu trenutnu listu, stari redovi se brišu).

## Baza podataka

Nema migration alata — šema se ručno primenjuje (raw SQL, uvek uz potvrdu
pre izvršavanja). Grupe tabela:

**Ručna/PDSU evidencija:**
`ip_entries`, `ip_status_history`, `printers`, `printer_connected_computers`,
`inventory_items`

**Metapodaci računara (i ručni i preko agenta):**
`computer_metadata` + child tabele `computer_metadata_storage`,
`computer_metadata_gpus`, `computer_metadata_nics`,
`computer_metadata_ram_modules`

**PDSU (i ručni i preko agenta):**
`computer_software`, `computer_drivers`, `computer_services`,
`computer_updates`, `computer_available_updates`, `computer_printers`,
`computer_event_logs` (jedina append-only — ostale su delete+reinsert na
svaki sync)

**RMM/agenti:**
`agents`, `agent_monitoring` (1:1 upsert-latest snapshot),
`agent_monitoring_history` (dnevni snapshot, koristi se za trend/anomalija
analizu — vidi ispod), `agent_jobs`, `agent_releases`, `agent_update_log`

**Dnevni izveštaj i push:**
`daily_reports` (JSON sadržaj, `opened_at` za pročitano/nepročitano),
`push_subscriptions`

**Auth:**
`users`

Sve tabele koriste `id INT AUTO_INCREMENT` primarne ključeve i `utf8mb4`.
FK-ovi na `agents.id` dosledno koriste `ON DELETE CASCADE` (brisanje agenta
briše i njegov monitoring/istoriju/jobove).

## Frontend

### Stek

Vue 3 (Composition API, `<script setup>`), Vite, Vue Router, Tailwind CSS 4,
`vite-plugin-pwa` (PWA manifest + service worker), `xlsx` za export.

### Struktura

```
views/          — stranice (rute), jedan fajl po stranici
components/     — deljene komponente (AppButton, ConfirmDialog,
                  SlideOverPanel, ThemeToggle, PushNotificationToggle...)
components/pdsu/— PDSU tab komponente (Overview/Software/Drivers/
                  Services/Updates)
composables/    — deljena stateful logika (usePaginatedRoute,
                  useAbortableFetch, useTheme, usePushNotifications...)
utils/          — format, math, fetch/auth helperi
layouts/        — MainLayout (header, nav, breadcrumbs, footer)
router/         — rute + auth guard
```

### Vue-specifične napomene

- `MetadataView.vue` sadrži nekoliko malih chart/widget komponenti
  definisanih inline preko `defineComponent`+`h()` (render funkcije), umesto
  posebnih `.vue` fajlova — namerno, radi lokalnosti (koriste se samo u tom
  fajlu).
- `usePaginatedRoute` composable sinhronizuje filter/paginaciju state sa
  `route.query` — koristi se dosledno na svim listing stranicama (Home,
  Agenti, Inventar, Štampači...), tako da se svaki filter odražava u URL-u i
  može se podeliti/bookmark-ovati.

### PWA i push notifikacije

App je instalabilan kao Progressive Web App (`vite-plugin-pwa`,
`generateSW` strategija). `public/push-sw.js` je uvezen u auto-generisani
service worker preko `workbox.importScripts` i dodaje `push`/
`notificationclick` listener-e. `usePushNotifications.js` composable
upravlja subscribe/unsubscribe tokom preko browser Push API-ja, ključevi
dolaze sa backend-a (`GET /api/protected/push/public-key`).

**Napomena za iOS:** Web Push radi tek od iOS 16.4, i samo ako je stranica
prethodno dodata na početni ekran ("Add to Home Screen") — na Androidu radi
i bez toga.

### Tamna tema

Class-based (`@custom-variant dark`, Tailwind v4), ne samo
`prefers-color-scheme`. `useTheme.js` composable upravlja light/dark/system
izborom, perzistira u `localStorage`, i `index.html` ima inline skriptu koja
primenjuje temu PRE prvog crtanja stranice (izbegava svetlo→tamno bljesak).

Umesto ručnog dodavanja `dark:` varijanti u desetine fajlova, cela tamna
tema je implementirana **centralno u `main.css`** — preslikavanjem
utility klasa koje app već koristi konzistentno (`bg-white`, `text-slate-*`,
`bg-slate-50/100`, status chip triplete poput `bg-emerald-50`/
`text-emerald-700`/`border-emerald-200`) na tamne ekvivalente pod `.dark`
selektorom. Zasićene boje (dugmad, čvrsti status bedževi, boje segmenata na
grafikonima) su namerno ostavljene netaknute — već rade dobro na tamnoj
pozadini.

### Mobilni UX

Nav traka i tab redovi (Agent detalji, PDSU inventar) prelaze u
horizontalni scroll ispod `sm` breakpoint-a umesto lomljenja u više redova.
Guste filter trake (Home, Agenti, Inventar) se skupljaju iza dugmeta
"Filteri" sa brojčanikom aktivnih filtera na mobilnom, dok pretraga/
statistika/paginacija ostaju uvek vidljivi.

## Netdesk Agent (Windows Service)

### Stek

C#, .NET Framework 4.5.2 (namerno — cilj je Windows 7 SP1+ podrška bez
instaliranja ičega novijeg). SDK-style `.csproj` projekti. Newtonsoft.Json
za (de)serijalizaciju, sa `CamelCaseNamingStrategy { OverrideSpecifiedNames
= false }` (ne standardni `CamelCasePropertyNamesContractResolver` — taj
tiho pregazi eksplicitne `[JsonProperty]` nazive).

### Struktura

```
Netdesk.Agent.Common/
  Configuration/   — AgentSettings, AgentState, Paths
  Http/            — NetdeskApiClient (HTTP wrapper), auth headeri
  Inventory/       — HardwareCollector, SoftwareCollector, DriverCollector,
                     ServiceCollector, WindowsUpdateCollector
  Monitoring/      — MonitoringCollector (CPU/RAM/disk/AV/FW/BitLocker/temp)
  Jobs/            — JobExecutor, ProcessRunner
  EventLogs/       — EventLogCollector, EventLogBookmarks (append-only sync)
  Update/          — UpdateManager (proveri→preuzmi→verifikuj→pokreni Updater)
  Logging/         — FileLogger

Netdesk.Agent.Service/    — Netdesk.Agent.Service.exe, Windows Service ili
                             --console debug mod, isti AgentWorker loop
Netdesk.Agent.Updater/    — odvojen proces, fizički menja fajlove servisa
                             (running proces ne može da prepiše sopstvene
                             fajlove na Windows-u)
```

### Instalacioni raspored (bitno za auto-update)

```
C:\Program Files\NetdeskAgent\
├── Service\    — prepisuje se pri svakom auto-update-u
└── Updater\    — NAMERNO odvojen folder, nikad se ne prepisuje
```

### Ključne funkcionalnosti

- **Enrollment + heartbeat** — jednom se registruje (deljeni enroll token →
  trajni `agentId`+`apiKey`), zatim periodičan heartbeat (podrazumevano
  30s) sa monitoring payload-om.
- **Monitoring** — CPU/RAM/disk preko WMI, antivirus preko
  `root\SecurityCenter2`, firewall preko registry-ja (namerno ne
  `netsh` parsing — lomi se na ne-engleskim Windows lokalizacijama),
  BitLocker/temperatura best-effort (često nedostupno po OEM-u).
- **Inventory sync** — hardver, softver (registry Uninstall ključevi, ne
  `Win32_Product` — taj triguje spor MSI repair), drajveri, servisi,
  instalirani i dostupni Windows update-i (potonji preko COM-a,
  `Microsoft.Update.Session` — WMI nema vidljivost nad pending update-ima).
- **Job execution** — 8 od 10 tipova komandi izvršava direktno
  (restart/shutdown/logoff preko `shutdown.exe` sa 15s odloškom da HTTP
  rezultat stigne pre gašenja; logoff preko WTS API-ja jer `shutdown /l`
  ne radi iz LocalSystem servisa), `collect_inventory`/
  `refresh_software_list` idu preko `InventoryCollector`.
- **Auto-update** — proveri verziju po deployment grupi → preuzmi → SHA-256
  provera → (opciono) provera digitalnog potpisa preko lanca do interne
  root CA → pokreni Updater → Updater menja fajlove i restartuje servis,
  sa automatskim rollback-om pri bilo kom izuzetku.

Detaljnija arhitektura, build preduslovi, i sva "gotcha" saznanja iz
razvoja (TLS 1.2 na Win7, JSON contract resolver zamke, itd.) su u
[`service/README.md`](../service/README.md).

## Remote screen control (VNC)

Custom, view-and-control ekran (miš + tastatura), namerno bez consent
banner-a na target mašini i bez snimanja sesije (samo `activity_log`
zapis) — isto tiho ponašanje kao postojeći job sistem.

**Zašto ne WinRM/postojeći VNC** — agent je poll-based (izlazno inicira
sve konekcije, ništa se ne osluškuje na target mašini), pa je ovo
rešenje dizajnirano da zadrži taj isti bezbednosni princip umesto da
zahteva otvoren port na target mašini.

**Tok:**
1. `POST /api/protected/agents/:id/vnc/start` (admin/operator) - upiše
   `vnc_sessions` red (`pending`) i običan `agent_jobs` red
   (`commandType: "start_vnc_stream"`, `payload: { sessionId }`) - START
   signal ide kroz **postojeći 15s job-poll**, namerno bez posebne
   "probudi agenta odmah" signalizacije (veći, zaseban poduhvat van
   obima ovoga).
2. Agent na sledećem poll ciklusu (`AgentWorker.ProcessJobAsync`)
   prepoznaje `start_vnc_stream` posebno - NE ide kroz `JobExecutor`
   (sinhrono, blokiralo bi poll petlju za celo trajanje sesije). Umesto
   toga odmah prijavljuje "started" i pokreće `VncStreamer.RunAsync` na
   sopstvenom `Task.Run` (isti obrazac kao `NetdeskAgentService.OnStart`).
3. `VncStreamer` (`service/Netdesk.Agent.Common/Vnc/`) otvara **sopstvenu,
   trajnu** `ClientWebSocket` konekciju ka
   `wss://.../api/agents/vnc-stream?sessionId=N` (izlazno, isti Bearer
   `agentId:apiKey` kao svaki HTTP poziv) - potpuno odvojenu od
   job-poll HTTP kanala. Dve konkurentne petlje na istoj konekciji:
   šalje JPEG frame-ove (`ScreenCaptureService`, GDI `CopyFromScreen`,
   ~2-3 FPS), prima JSON input evente i prosleđuje ih `InputInjector`-u
   (`user32.dll!SendInput`, apsolutno pozicioniranje miša preko
   `MOUSEEVENTF_VIRTUALDESK`).
4. Admin browser se paralelno poveže na
   `wss://.../api/protected/vnc-stream/:sessionId?token=JWT` (JWT kao
   query param, ne header - browser-ov `WebSocket` API ne podržava
   custom header-e; ovo ne prolazi kroz Express/morgan pa se token ne
   loguje).
5. `backend/ws/vncRelay.js` - jedan `WebSocketServer({ noServer: true })`
   kačen na postojeći `https.Server` (`server.on("upgrade", ...)`, isti
   port/cert). Dvosmeran relay bez transformacije: binary frame agent→
   viewer, JSON input viewer→agent. Zatvaranje JEDNE strane zatvara i
   drugu, markira `vnc_sessions.status = 'ended'`. Server-side 30-min
   hard cap sprečava zaboravljenu sesiju da radi unedogled.

**Frontend**: `VncViewer.vue` (na `AgentDetailView`, tab "Ekran", obeležen
BETA bedžom) - binary frame → `Blob` → `<img>` (zamenjuje prethodni
`URL.createObjectURL`, revoke stari da ne curi memorija). Miš/tastatura na
`<img>` elementu → throttle-ovan JSON preko iste WebSocket veze
(`frontend/src/constants/vkCodes.js` prevodi browser `KeyboardEvent.code`
u Windows VK kod pre slanja).

**Feature flag**: `startVncSessionService` proverava `vnc_enabled`
podešavanje (vidi "Konfiguracija / feature flags" ispod) pre kreiranja
sesije - podrazumevano isključeno (`default: "false"`), admin ga uključuje
na `/config` strani. Nije još potvrđeno uživo na pravoj mašini - vidi
"Poznata ograničenja".

## Konfiguracija / feature flags

Generički registar uklopivih podešavanja (`app_settings` tabela,
key/value po redu) - `backend/dtos/appSettings.dto.js`'s `APP_SETTINGS`
lista je jedino mesto koje treba dopuniti za novi checkbox (label,
opis, default) - repo/service/controller/`/config` frontend stranica su
generički i automatski ga podignu, bez posebnog koda po podešavanju.
Admin-only za čitanje i pisanje (`/api/protected/settings`) - koja je
funkcionalnost uključena je samo po sebi administrativna informacija,
ista logika kao `users.routes.js`/`activityLog.routes.js`. Drugi servisi
proveravaju flag preko `appSettings.service.js`'s `isFeatureEnabled(key)`
helper-a (trenutno jedini potrošač: VNC start, iznad).

## API pregled

Puna lista ruta po domenu je u odgovarajućim `routes/*.routes.js`
fajlovima. Zajednički obrasci kroz ceo API:

- Sve liste su paginirane (`page`/`limit` query, `{ items, page, limit,
  total, totalPages }` odgovor).
- Filter query parametri koji ne prolaze validaciju (npr. nepoznat enum)
  se **tiho ignorišu**, ne vraćaju 400 — samo eksplicitno neispravan format
  tela zahteva (zod `safeParse` neuspeh) vraća 400.
- Rute koje bi mogle biti pogrešno pojedene od strane `/:id` rute (npr.
  `/agents/filter-options`, `/reports/latest`) su namerno registrovane
  PRE `/:id` rute u router fajlu — ovo je pokriveno regresionim testovima
  (`http.routes.test.js`) posle bar dva stvarna incidenta ovog tipa.
- `cacheNoStore` middleware je primenjen na sve `/api/protected/*` grupe —
  admin podaci se nikad ne keširaju u browseru.

## Deployment

**Lokalni dev** — dva porta, dva procesa: Vite dev server (frontend,
podrazumevano `:5174`) i Express (backend, `:3000`), `VITE_API_URL` u
`frontend/.env` je pun URL ka backend-u (npr. `https://localhost:3000`) jer
su na različitim origin-ima — `CORS_ALLOWED_ORIGINS` mora da uključi
frontend-ov origin.

**Produkcija** — jedan port, jedan proces: nakon `npm run build` u
`frontend/`, backend (`app.js`) sam servira `frontend/dist/` fajlove
(`express.static` + SPA fallback ruta koja vraća `index.html` za svaki
GET koji nije pod `/api/*` — Vue Router ima sopstveni catch-all koji tada
preuzima i prikazuje 404 na klijentu). `VITE_API_URL` u produkcionom
`.env` treba da bude **prazno** (relativni pozivi, isti origin). Ovo
ponašanje je uslovljeno time da li `frontend/dist/index.html` stvarno
postoji na disku — ako ne postoji (npr. lokalni dev bez build-a), backend
se ponaša identično kao pre (samo `/api/*`, sve ostalo 404), tako da ovo
ne menja lokalni dev workflow niti zahteva build za obično testiranje
backend-a.

Prednost: samo jedan port treba da bude dostupan spolja/kroz firewall
(umesto dva), agent-facing API (`/api/agents/*`) ostaje potpuno nepromenjen
u oba scenarija.

Produkcioni `.env` mora imati `NODE_ENV=production` — od toga zavisi HSTS
header (`helmet`) i CORS "deny-by-default" ponašanje (vidi Bezbednost
ispod). Bez ovoga, backend se ponaša kao dev čak i na produkciji.

`CORS_ALLOWED_ORIGINS` mora da sadrži backend-ov sopstveni origin (npr.
`https://10.230.62.81:3000`) i kad on sam servira frontend — browser šalje
`Origin` header i na same-origin fetch/XHR pozive, a provera u
`config/cors.js` ne pravi izuzetak za to, samo poredi sa allowlist-om.
Prazna lista u produkciji odbija i sopstvene pozive frontend-a.

## Pozadinski procesi

Backend pokreće tri dugotrajna procesa pri startu (`server.js`), svaki sa
samo-zakazujućim `setTimeout` petljom (ne `setInterval` — izbegava drift i
omogućava da svaki tick sačeka da se prethodni završi):

| Proces | Interval | Šta radi |
|---|---|---|
| `pingService.js` | 30s (podešeno) | ICMP ping svih `ip_entries`, upisuje online/offline status i istoriju promena |
| `pushNotificationWatcher.js` | 60s | Poredi trenutni skup aktivnih upozorenja sa prethodnim tick-om, šalje push SAMO za novopojavljena (ne ponavlja isti alarm svaki ciklus) |
| `dailyReportScheduler.js` | dnevno u 7:00 (self-rescheduling, DST-safe) | Generiše dnevni izveštaj, snima monitoring snapshot, šalje push |

**Trend i anomalija analiza** (`utils/trendAnalysis.js`, čiste funkcije bez
I/O) — pri svakoj generaciji dnevnog izveštaja, za svakog agenta se nad
poslednjih 90 dana `agent_monitoring_history` (disk/CPU/RAM) računa:
- **Threshold projekcija** (linearna regresija) — "za ~N dana stiže do
  90%" po metrici; vraća `null` za ravan/opadajući trend, premalo tačaka,
  ili već-iznad-praga vrednost (to pokriva postojeći alert, ne trend).
- **Anomalija** (z-score) — današnja vrednost naspram agent-ove sopstvene
  istorijske sredine/standardne devijacije (bez današnje tačke) — hvata
  jednokratni skok/pad koji linearna regresija ne vidi, bez obzira na
  trend. Dvosmerno (i neuobičajeno nisko i neuobičajeno visoko), prag
  `|z| >= 3`, minimum 7 tačaka za baseline.

## Bezbednost

- **Lozinke** — bcrypt hash (`bcryptjs`), sa tolerantnom migracijom sa
  legacy plaintext lozinki (proverava plaintext podudaranje, ako uspe
  odmah re-hash-uje).
- **Agent API ključevi** — SHA-256 hash u bazi (ne plaintext), poređenje
  preko `crypto.timingSafeEqual` (constant-time, sprečava timing napade).
- **SQL injection** — svi upiti su parametrizovani (`mysql2` placeholders);
  gde kolona za `ORDER BY` mora biti interpolirana (ne može se
  parametrizovati), koristi se eksplicitna allowlist (`SORT_FIELDS`/
  `sortMap`) — nikad direktno korisnički unos.
- **CORS** — eksplicitna allowlist origin-a (`CORS_ALLOWED_ORIGINS`),
  uključujući backend-ov sopstveni origin kad on sam servira frontend
  (browser šalje `Origin` header i na same-origin pozive); u produkciji
  (`NODE_ENV=production`) prazna lista znači nijedan origin nije dozvoljen,
  ni sopstveni (u dev modu, prazna lista = dozvoli sve, radi lakšeg
  lokalnog rada) — zato je `NODE_ENV=production` obavezan na produkciji,
  inače prazna lista slučajno znači "dozvoli sve".
- **Rate limiting** — `express-rate-limit`, `trust proxy` eksplicitno
  isključen (sprečava X-Forwarded-For spoofing osim ako je stvarni reverse
  proxy ispred, u kom slučaju treba svesno uključiti).
- **SSRF zaštita** — port scan funkcionalnost proverava da IP nije privatni
  opseg pre skeniranja (anti-SSRF guard).
- **Web Push** — VAPID ključevi, potpuno opciono (bez njih, subscribe
  endpoint i dalje postoji ali watcher ne šalje ništa).
- **Agent update paketi** — SHA-256 se računa server-side od stvarno
  uploaded bajtova (nikad se ne veruje klijentu), opciono RSA-SHA256
  potpisivanje preko interne CA.
- **RBAC** — tri role (`admin`/`operator`/`viewer`) u `users.role`. Default
  politika (`middlewares/requireRole.middleware.js`): GET otvoren svakoj
  ulozi, sve što menja stanje traži bar `operator`. Admin-only: Users
  management i Agent Releases (upload/aktivacija verzije - pogađa celu
  flotu). Izuzeci gde je `viewer` ipak dozvoljen: push subscribe/unsubscribe
  i report mark-read (lične akcije, ne organizacione mutacije).
- **Audit log** (`activity_log` tabela) — generički HTTP-nivo trag: svaki
  ne-GET zahtev na `/api/protected/*` (bez obzira na ishod - i 403/400 se
  beleže), plus GET zahtevi koji gledaju jedan konkretan zapis (putanja se
  završava brojem, npr. `/agents/47` - liste/pretraga/paginacija se ne
  beleže), plus `login_success`/`login_failed` sa IP adresom. Vidljivo samo
  adminu na `/logs`. Beleženje je fire-and-forget (`res.on("finish")`,
  greška se guta) - ne sme da obori pravi zahtev.

## Poznata ograničenja

- Nema migration alata — šema se ručno primenjuje po okruženju (rizik od
  drift-a između dev/produkcije, video se uživo bar jednom sa
  `agent_jobs.payload` JSON tipom).
- Job queue je async/polling (agent povlači na sledećem ciklusu, ne
  odmah) — nema uživo/real-time kanala za komande.
- **VNC (remote screen control) nije potvrđen uživo na pravoj mašini.**
  Agent servis radi pod LocalSystem nalogom, što znači da živi u Session 0
  — Windows (od Viste naovamo) izoluje Session 0 od interaktivne
  korisničke sesije. Postoji realan rizik da `Graphics.CopyFromScreen`
  pozvan iz Session 0 snima praznu Session-0 pozadinu, ne stvarni
  korisnički ekran (isti tip problema kao `LogoffActiveSessions` u
  `JobExecutor.cs`, koji baš zato koristi WTS API umesto direktnog poziva).
  Ako se ovo potvrdi uživo, pravo rešenje je pomoćni proces pokrenut
  UNUTAR korisničke sesije (`WTSQueryUserToken` + `CreateProcessAsUser`),
  ne direktan capture/injection iz samog servisa. Zato je funkcija iza
  `vnc_enabled` feature flag-a (podrazumevano isključeno) - videti
  "Konfiguracija / feature flags".

Za širi pregled ideja za sledeću verziju (uključujući razmatranje mobilne
aplikacije i lokalnog AI-ja), videti [`agent-roadmap.md`](agent-roadmap.md).
