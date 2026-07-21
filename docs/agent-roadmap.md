# Netdesk Agent — ideje za sledeću verziju

Ovaj dokument je pregled šta bi imalo smisla dodati u narednoj verziji sistema, na
osnovu onoga što je trenutno izgrađeno (enrollment, heartbeat, monitoring, pun
inventory sync, job queue za komande, event log, auto-update sa potpisivanjem,
alerting preko postojećeg notifikacionog sistema).

## Trenutno stanje (kratko)

- Agent (Windows Service, .NET Framework 4.5.2) šalje heartbeat + monitoring
  (CPU/RAM/disk/AV/FW/BitLocker/temp), pun hardverski/softverski inventar, event
  log (append-only), i izvršava komande iz reda čekanja (restart, shutdown,
  logoff, servisi, PowerShell skripte, brisanje temp fajlova).
- Auto-update je zatvoren end-to-end, sa server-side potpisivanjem paketa
  (RSA-SHA256) i verifikacijom na klijentu preko lanca do interne root CA.
- Alerting je ugrađen u postojeći notifikacioni sistem (offline mašine, disk
  >90%, AV/FW isključen, neuspeli jobovi, WU servis stao) — sve ide na jednu
  listu u UI-u (`NotificationTicker`).
- Monitoring je snapshot (poslednje stanje), ne istorija — nema trend grafova
  kroz vreme za CPU/RAM/disk.
- Deployment grupe (test/it/pilot/rest) postoje za auto-update, ali nema šireg
  koncepta grupisanja/tagovanja mašina van `department` polja.

## Ideje za sledeću verziju

### 1. Uživo pristup / remote support
Trenutni job queue je async (agent povlači komande na svaki poll ciklus, ne
odmah). Za pravu IT podršku uživo bi imalo smisla:
- **Real-time kanal** (WebSocket/SignalR ili slično) umesto pollinga — komande
  bi stizale odmah, ne na sledeći interval.
- **Live PowerShell/CMD sesija** iz browsera (kao "remote shell" prozor), ne
  samo fire-and-forget skripta bez interakcije.
- Eventualno remote screen view (VNC-like) — najveći poduhvat na listi, ali
  najviše bi smanjio potrebu za WinRM/AnyDesk/TeamViewer fallback-om.

### 2. Odobravanje instalacije paketa i sertifikata
Namerno ostavljeno neurađeno u ovoj fazi (nedostaje katalog odobrenih paketa).
Sledeći korak:
- Katalog odobrenih MSI/EXE paketa (verzija, hash, ko je odobrio).
- Job tip za instalaciju/deinstalaciju iz kataloga, ne proizvoljan EXE.
- Isto za sertifikate — katalog + distribucija na agente.

### 3. Istorija monitoring podataka (trending)
Sada je `agent_monitoring` 1:1 upsert-latest tabela. Vredelo bi:
- Periodično snimati CPU/RAM/disk u vremenske serije (npr. svakih N minuta,
  sa retention politikom da tabela ne raste beskonačno).
- Grafikon "poslednja 24h/7 dana" na `AgentDetailView` — trenutno se vidi samo
  trenutno stanje, ne trend (da li disk polako puni, da li RAM raste).

### 4. Konfigurabilni alerting
- Disk prag (90%) je hardkodovan — prebaciti u admin-konfigurabilnu vrednost
  po mašini/grupi.
- Eskalacija van UI tickera: email/Slack/Teams webhook za kritične alarme
  (mašina offline >X, disk pun, AV isključen) — posebno korisno kad niko ne
  gleda dashboard u tom trenutku.
- "Maintenance window" — mogućnost da se mašina privremeno isključi iz
  offline-alertinga (planirano gašenje ne bi trebalo da pravi lažni alarm).

### 5. Audit log administratorskih akcija
Trenutno se beleži da li je job izvršen i da li je uspeo, ali nema
centralizovanog "ko je uradio šta, kada, na kojoj mašini" pregleda (restartovao
servis, deaktivirao release, promenio deployment grupu, opozvao agenta). Za
tim sa više administratora ovo postaje bitno pre ili kasnije.

### 6. Uloge/permisije (RBAC)
Sada je auth binaran — ulogovan korisnik vidi/radi sve. Sledeći korak bi bio
uloge (npr. "samo pregled" vs "pun pristup", ili ograničenje po odeljenju) ako
tim administratora poraste.

### 7. Grupisanje/tagovanje mašina
`department` je jedino polje za grupisanje. Fleksibilniji tag sistem (više
tagova po mašini, npr. "lokacija", "kritičnost", "vlasnik") bi olakšao
filtriranje i ciljano gađanje jobova/update grupa na veće flote.

### 8. Licence i garancije (asset tracking)
Softverski inventar već postoji (šta je instalirano), ali nema praćenja
licenci (broj kupljenih vs iskorišćenih) ni garancije hardvera vezano za
serijski broj — prirodna nadogradnja s obzirom da su podaci (serial, model)
već sakupljeni.

### 9. Izveštaji / eksport
Trenutno se podaci gledaju kroz UI tabele/grafikone. Zakazani (npr. mesečni)
PDF/Excel izveštaj — stanje flote, red-flags, uptime — bi imao vrednost za
izveštavanje van tima.

### 10. Instalacioni paket / GPO distribucija
`Install-NetdeskAgent.ps1` postoji, ali za veće flote ima smisla:
- MSI paket koji se distribuira preko GPO/SCCM/Intune umesto ručnog/skript
  install-a po mašini.
- "Zero-touch" enroll (agent se sam registruje sa unapred definisanim
  deployment group-om, bez ručnog kucanja enroll tokena po mašini).

---

## Da li ima smisla mobilna aplikacija?

**Kratak odgovor: puna native mobilna app — verovatno ne; laka PWA sa push
notifikacijama — da, ima smisla.**

Razlozi:

- Ovo je interni IT alat koji koristi mali broj administratora, i najveći deo
  posla (tabele, grafikoni, upload paketa, editovanje inventara) je po prirodi
  desktop rad — teško bi stalo na mali ekran bez značajnog dupliranja UI-a.
  Puna native app (posebna Android/iOS kodna baza, posebno održavanje) bi bila
  velika investicija za mali realni dobitak.
- Ono što BI imalo vrednost na mobilnom je uzak skup stvari:
  - **Push notifikacija** kad nešto kritično padne (mašina offline, disk pun,
    AV/FW isključen) — administrator ne sedi non-stop za dashboardom.
  - Brz pregled statusa flote i eventualno "brze akcije" (restart servisa,
    restart mašine) sa telefona dok je administrator van kancelarije.
- Za tačno taj uzak skup, **PWA (Progressive Web App)** je bolji izbor od
  native app-a:
  - Postojeći Vue frontend se instalira na telefon "kao app" (ikonica na
    home screen-u), bez posebne kodne baze — jedan frontend za desktop i
    mobilni.
  - Web Push notifikacije rade i na Androidu i (od skoro) na iOS-u kroz PWA.
  - Trošak implementacije je mnogo manji: manifest + service worker + jedan
    novi backend endpoint za push pretplate — ne novi projekat/tim/store
    review proces (Apple App Store pregled, Google Play politika).
- Native app bi imao smisla jedino ako bi se planiralo šire tržište/veći broj
  korisnika van internog IT tima (npr. da krajnji korisnici sami prijavljuju
  probleme sa telefona) — što trenutno nije deo obima ovog projekta.

**Preporuka:** ne graditi punu mobilnu app u sledećoj verziji; ako je potreba
realna, dodati PWA manifest + push notifikacije za kritične alarme na
postojeći frontend — najmanji trošak, najveći deo realne vrednosti.
