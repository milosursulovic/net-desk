# CI/CD setup (jednokratno, na serveru)

Workflow je u `.github/workflows/ci-cd.yml`. Ovaj dokument je samo za
jednokratni setup na `/opt/netdesk` serveru - GitHub sam ne može ništa od
ovoga da uradi umesto tebe, runner mora fizički da se instalira tamo.

Pre nego što krene prvi automatski deploy: **ugasi postojeći polling
servis/cron potpuno** (rečeno da je već deaktiviran - proveri da stvarno
nema više `git pull`/restart u pozadini, da se dva mehanizma ne preklapaju).

## 1. Instaliraj self-hosted runner

GitHub → repo → **Settings → Actions → Runners → New self-hosted runner**,
prati uputstvo tamo (bira se sam OS/arhitektura). Skraćeno, na serveru:

```bash
sudo mkdir -p /opt/actions-runner && cd /opt/actions-runner
# link/token dobijaš sa GitHub stranice iz koraka iznad (ističe brzo)
curl -o actions-runner-linux-x64.tar.gz -L <URL sa GitHub stranice>
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/milosursulovic/net-desk --token <TOKEN>
```

Kad pita za labele, podrazumevano (`self-hosted`) je dovoljno - workflow
cilja `runs-on: self-hosted` bez dodatnih labela.

Instaliraj ga kao servis (da preživi reboot, radi bez otvorenog terminala):

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

## 2. Dozvoli runner-u da restartuje netdesk.service BEZ passworda

Runner servis podrazumevano radi pod nalogom koji ga je instalirao (proveri
sa `sudo ./svc.sh status` koji je to user). Deploy job zove
`sudo systemctl restart netdesk.service` - bez sledećeg, taj korak će
zaglaviti čekajući lozinku koju CI nikad ne može da unese.

```bash
sudo visudo -f /etc/sudoers.d/netdesk-deploy
```

Sadržaj (zameni `RUNNER_USER` stvarnim nalogom iz koraka iznad):

```
RUNNER_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart netdesk.service, /usr/bin/systemctl is-active --quiet netdesk.service
```

## 3. Proveri da runner ima šta mu treba

Isti nalog mora da može da pokrene `npm ci`/`npm run build`/`npm run migrate`
kao i sad (node/npm na PATH-u, mrežni pristup npm registry-ju, MySQL/MariaDB
dostupan za migracije) - u suštini isto okruženje koje je i dosadašnji
polling skript koristio, samo sad pokrenuto od strane runner-a umesto crona.

`rsync` mora biti instaliran (`rsync --version`) - obično je već tu, ali
proveri.

**Mrežna SSL inspekcija (poznat problem)**: mreža ove ustanove ima
SSL-inspecting firewall/proxy koji ubacuje sopstveni self-signed root CA u
sav HTTPS saobraćaj. `curl` to ne primeti (koristi sistemski trust store,
koji taj CA već ima), ali Node/npm koristi svoj ugrađeni CA bundle i ne
veruje mu - `npm ci` visi u beskonačnom retry-u sa `SELF_SIGNED_CERT_IN_CHAIN`
umesto brzog fail-a. Rešenje - dodaj u runner-ov `.env`
(`/opt/actions-runner/.env`, čita ga runner servis i ubaci u svaki job):

```
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
```

pa restartuj servis (`sudo ./svc.sh stop && sudo ./svc.sh start`). Ako
runner ikad treba da se reinstalira na istom ili drugom serveru u istoj
mreži, ovaj korak ponovi odmah - bez njega prvi deploy će izgledati kao da
je zaglavio (a zapravo samo retry-uje TLS handshake u nedogled).

## 4. Prvi deploy

Ništa posebno - prvi push na `main` posle ovog setup-a će automatski da
uradi CI pa deploy. `/opt/netdesk/app` već ima `.env` fajlove i
`backend/uploads/` sa pravim podacima - `.gitignore`-filter u workflow-u ih
ostavlja netaknutim (vidi komentar u `ci-cd.yml`), sinhronizuje se samo kod
praćen u git-u.

Prati ga uživo: GitHub repo → **Actions** tab.

## Napomena o testovima

`backend/tests/integration/*` (hita pravu bazu) namerno NIJE deo CI-ja - u
repo-u ne postoji baseline SQL šema (samo inkrementalne migracije od 0001
nadalje), pa se ne može pouzdano podići prazna baza za efemerni CI runner.
Taj test suite ostaje ono što je i do sada bio: ručno `npm test` na dev
mašini pre push-a (CLAUDE.md "Workflow expectations"). CI pokriva ono što
realno može bezbedno da pokrije bez baze: frontend build/lint/test i
backend-ove DB-free unit testove (`tests/unit`).
