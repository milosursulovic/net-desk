# Docker Compose instalacija

Ceo sistem (backend + servirani frontend + MariaDB) se pokreće preko
`docker-compose.yml` iz jednog `docker compose up -d` poziva. Cilj: da se
sistem posle nesreće (nova mašina, izgubljen server) reprodukuje iz git
repo-a + par fajlova koji NIKAD ne idu u git (`.env`, sertifikati, backup
baze), umesto da se ručno podešava iznova.

**Van obima ovog fajla:** C# Windows agent (`service/`) - potpuno nezavisan,
ide dalje kako radi i danas, ništa se ne menja na agent strani.

## Šta se ne commit-uje (pripremiti ručno, po serveru)

- `.env` - kopija `.env.docker.example` sa stvarnim vrednostima (vidi
  komentare u tom fajlu za značenje svakog polja).
- `./certs/` folder (bind-mount-ovan u kontejner na `/certs:ro`), sa TAČNO
  ova četiri fajla (imena moraju da se poklapaju sa `SSL_KEY`/`SSL_CERT`/
  `AGENT_SIGNING_CERT_PATH`/`AGENT_SIGNING_KEY_PATH` iz `.env`):
  - `server.pem` + `server-key.pem` - HTTPS leaf sertifikat/ključ
    (`https.createServer()` u `backend/server.js`).
  - `agent-signing.pem` + `agent-signing-key.pem` - sertifikat/ključ za
    potpisivanje agent release paketa (`backend/utils/agentSigning.js`,
    opciono - ako izostave, release-i se šalju bez potpisa).
- **NE stavljati `rootCA-key.pem` (privatni ključ same root CA) nigde na
  server, ni u `./certs/`, ni bilo gde drugde** - server ga nikad ne čita
  (ni HTTPS ni potpisivanje release-a ne koriste root privatni ključ
  direktno, samo leaf sertifikate KOJE JE root već potpisao), a to je
  najosetljiviji fajl u celom lancu poverenja (kompromitovan = neko može da
  izda nov "legitiman" sertifikat kom veruju svi agenti). Drži ga isključivo
  offline, odvojeno.
- `rootCA.pem` (sam javni CA sertifikat, NE privatni ključ) ide u
  `backend/uploads/downloads/rootCA.pem` - to je deo `uploads` named
  volume-a, ne posebnog bind-mount-a (isti fajl koji `deploy-trusted-root-cert`/
  `deploy-intermediate-cert` PowerShell presetovi već preuzimaju odatle).

**Zašto se sertifikati NE regenerišu**: sva tri (root, HTTPS leaf,
agent-signing) su već trusted/u upotrebi na desetinama već deployovanih
Windows agenata. Nov CA bi zahtevao ponovni rollout poverenja svuda. Dokle
god se ISTI fajlovi prenesu 1:1 na novi host (i IP ostaje isti), ništa se ne
menja na agent strani.

## Lokalno pokretanje (test/dev, bez pravih podataka)

```
cp .env.docker.example .env
# popuni .env - za lokalni test dovoljno je DB_NAME/DB_USER/DB_PASS/
# DB_ROOT_PASSWORD/JWT_SECRET/AGENT_ENROLL_TOKEN, ostalo može prazno
mkdir certs
# ubaci server.pem/server-key.pem (npr. mkcert za localhost) u certs/
docker compose up --build
```

Prazan `db-data` volume + `backend/migrations/0000_baseline_schema.sql`
(idempotentan - `CREATE TABLE IF NOT EXISTS`, sigurno za ponovno pokretanje)
= puna šema iz ničega, bez ijednog ručnog SQL koraka.

## Produkcioni cutover runbook

Redosled je bitan - baza mora biti gore i popunjena PRE nego što `app`
servis prvi put startuje (da migracije zateknu već postojeću šemu, ne praznu).

1. **Na starom serveru**: pun dump (šema + podaci):
   ```
   mysqldump --routines --triggers --single-transaction -u root -p netdesk > netdesk_backup.sql
   ```
   plus kopiraj `backend/uploads/` folder u celini i sva 4 `./certs/` fajla.
2. **Na novom (Linux) host-u**: kloniraj repo, pripremi `.env` i `./certs/`
   kako je opisano gore, vrati `backend/uploads/` folder na isto mesto koje
   `uploads` named volume očekuje (ili prosto prekopiraj sadržaj UNUTAR
   volume-a posle prvog `docker compose up` preko `docker cp`).
3. Podigni SAMO bazu i sačekaj da bude zdrava:
   ```
   docker compose up -d db
   docker compose ps   # čekaj "healthy"
   ```
4. Uvezi pravi dump u praznu bazu (radi na PRAZNOM `db-data` volume-u - ovo
   MORA biti pre prvog starta `app` servisa):
   ```
   docker compose exec -T db sh -c 'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' < netdesk_backup.sql
   ```
5. Podigni app servis:
   ```
   docker compose up -d app
   docker compose logs -f app   # potvrdi "Nema novih migracija." (dump već
                                  # nosi popunjenu schema_migrations tabelu)
   ```
6. Provera: otvori `https://<IP>:3000` u browseru, uloguj se, potvrdi da su
   agenti/podaci vidljivi, pošalji test komandu jednom agentu.
7. Tek POSLE potvrde da sve radi: prebaci IP/DNS sa starog servera na novi,
   ugasi stari.

## Auto-deploy (ekvivalent postojećem `deploy/deploy.ps1`)

`deploy/` folder je namerno gitignored (server-specifične putanje) - isto
važi i za Docker varijantu. Na novom serveru napraviti sopstveni
`deploy-docker.sh` (van repo-a), po istom "poll, ne webhook" obrascu kao
postojeći `deploy.ps1`:

```sh
#!/bin/sh
cd /path/to/net-desk || exit 1
git fetch origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0  # nema novih commit-ova
fi
git reset --hard origin/main
docker compose build app
docker compose up -d app   # "db" servis se ne dira
```

Pokrenuti preko cron-a (npr. na svakih 5 min), analogno Task Scheduler-u na
staroj Windows postavci.

## Poznata ograničenja

- **Jedna instanca `app` kontejnera, bez horizontalnog skaliranja** -
  `backend/ws/vncRelay.js` drži VNC relay sesije u in-memory mapi vezanoj za
  jedan proces. Nije regresija (i danas je jedan Node proces), samo se ovde
  eksplicitno ne sme dodati `replicas`/load balancer ispred.
- **Nema reverse proxy-ja namerno** - `backend/server.js` sam terminiše TLS
  sa custom cipher listom (`backend/config/ssl.js`) radi Windows 7 agenata
  bez KB4019276. Dodavanje nginx/traefik ispred bi ili duplo terminisalo TLS
  ili prebacilo termination na proxy i pokvarilo tu kompatibilnost.
