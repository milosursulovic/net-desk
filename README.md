# NetDesk

Interni IT alat za pregled i upravljanje mrežnom/hardverskom infrastrukturom —
IP adrese, metapodaci računara, štampači, hardverski inventar i PDSU analitika
(softver, drajveri, servisi, Windows update-i), na jednom mestu.

## Sadržaj

- [Struktura projekta](#struktura-projekta)
- [Tehnologije](#tehnologije)
- [Funkcionalnosti](#funkcionalnosti)
- [Pokretanje lokalno](#pokretanje-lokalno)
- [Environment varijable](#environment-varijable)
- [Skripte](#skripte)

## Struktura projekta

```
net-desk/
├── backend/    Express API server (Node.js, MySQL)
└── frontend/   Vue 3 SPA (Vite, Tailwind CSS)
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

## Funkcionalnosti

- **IP adrese** — evidencija računara po IP-u, pretraga/filter/sortiranje,
  online/offline status, port scan, XLSX export
- **Metapodaci** — hardverski detalji po računaru (CPU, RAM, disk, GPU, mreža)
  i agregatna analitika (pokrivenost, distribucije, top liste)
- **Štampači** — evidencija, povezivanje na računare, host dodela
- **Inventar hardvera** — rezervni delovi/oprema van mreže
- **PDSU analitika** — softver, drajveri, servisi i Windows update-i po
  računaru, sa pregledom i detaljnim tabelama

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
| `SSL_CERT`, `SSL_KEY`    | putanje do SSL sertifikata za HTTPS        |
| `CORS_ALLOWED_ORIGINS`   | dozvoljeni origin-i, odvojeni zarezom      |

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
