# Netdesk Agent (Windows Service)

Klijentska komponenta iz `Netdesk Agent - Tehnička specifikacija.pdf` — Windows
servis koji se instalira na svaki podržani računar i komunicira sa Netdesk
serverom (`backend/`) preko HTTPS-a. Odvojen projekat/stek od `backend/` i
`frontend/` — C#, .NET Framework 4.5.2 (zbog Windows 7 podrške).

## Status

Sve faze iz specifikacije su implementirane: enrollment, heartbeat, monitoring,
inventory sync (hardver/softver/servisi/Windows Update/štampači preko WMI i
registry-ja), job polling/izvršavanje (restart/shutdown/logoff/servisi/
PowerShell/brisanje temp fajlova), event log sync, i auto-update (provera
verzije, preuzimanje, SHA-256 + digitalni potpis verifikacija, zamena preko
odvojenog Updater procesa, rollback pri neuspehu).

**Namerno neurađeno** (videti komentare u kodu za detalje):
- Instalacija sertifikata i odobrenih paketa kao job komande — zahteva poseban
  katalog odobravanja koji nije izgrađen.
- Potpisivanje komandi (11.12) — trenutno se potpisuju samo update paketi, ne
  i pojedinačne job komande.

## Digitalni potpis update paketa

Pošto je organizacija već distribuirala internu root CA u trusted root store
svih upravljanih računara (koristi se za HTTPS ka Netdesk serveru), verifikacija
potpisa je zasnovana na toj istoj CA — nema potrebe za posebnom distribucijom
javnog ključa agentu.

**Podešavanje na serveru** (`backend/.env`):

```
AGENT_SIGNING_CERT_PATH=putanja/do/code-signing-sertifikata.pem
AGENT_SIGNING_KEY_PATH=putanja/do/privatnog-kljuca.pem
```

Sertifikat mora biti **izdat od iste interne CA** koja je već u trusted root
store-u računara (ne mora biti isti sertifikat koji se koristi za HTTPS -
poželjno je poseban code-signing sertifikat, ali mora deliti istu CA
lanac-do-root). Ako ova dva env-a nisu podešena, release paketi se i dalje
otpremaju normalno, samo bez potpisa (agent tada proveri samo SHA-256, kao
i pre) — potpisivanje je opciono, u skladu sa spec formulacijom "mogućnost".

**Kako radi:**
1. Server pri upload-u potpisuje sirove bajtove paketa (`RSA-SHA256`,
   `utils/agentSigning.js`) i čuva potpis u `agent_releases.signature`.
2. `GET /api/agents/update` vraća i `signature` i `signatureCertificatePem`
   (javni sertifikat, ne privatni ključ).
3. Agent (`UpdateManager.VerifySignatureIfPresent`) posle SHA-256 provere:
   - gradi `X509Chain` od primljenog sertifikata i proverava da vodi do
     trusted root (već prisutne na mašini) - `X509RevocationMode.NoCheck`
     jer organizacija verovatno nema CRL/OCSP za internu CA,
   - verifikuje RSA potpis nad preuzetim fajlom.
   - Ako sertifikat/paket nema potpis (server nema podešeno potpisivanje),
     provera se preskače i update ide dalje samo sa SHA-256 potvrdom.
   - Ako je potpis poslat ali provera (lanac ili sam potpis) ne uspe, update
     se pouzdano odbacuje.

**Napomena o .NET Framework 4.5.2 kompatibilnosti:** verifikacija koristi
stariji `RSACryptoServiceProvider.VerifyData(byte[], string, byte[])` API, NE
`RSA.VerifyData(..., HashAlgorithmName, RSASignaturePadding)` ni
`X509Certificate2.GetRSAPublicKey()` - oba su dodata tek u .NET Framework 4.6
i ne postoje na 4.5.2 (Windows 7 cilj).

**Testirano u ovoj sesiji** (van stvarnog Windows/Visual Studio okruženja):
generisan test self-signed sertifikat, potpisan test paket preko iste
Node.js logike koja se koristi u `agentSigning.js`, i verifikovan preko
identičnog C# koda kao `UpdateManager` (uključujući ceo HTTP round-trip -
pravi upload → pravi `/api/agents/update` odgovor → pravi download → uspešna
verifikacija, plus potvrda da namerno izmenjen/oštećen sadržaj ispravno
propada proveru). **X509Chain provera do stvarne trusted root CA nije
testirana** - to zahteva pravu Windows mašinu sa vašom internom CA već
instaliranom, što ovo sandboxovano okruženje nema.

## Struktura

```
Netdesk.Agent.sln
Netdesk.Agent.Common/     deljeni kod - modeli, HTTP klijent, WMI/registry
                          kolektori (Inventory/Monitoring/EventLogs), job
                          executor, update manager, config/state/logger
Netdesk.Agent.Service/    Netdesk.Agent.Service.exe - Windows Service
Netdesk.Agent.Updater/    Netdesk.Agent.Updater.exe - odvojen proces koji
                          fizički menja fajlove servisa i restartuje ga
```

## Raspored instalacije (bitno za auto-update)

```
C:\Program Files\NetdeskAgent\
├── Service\
│   ├── Netdesk.Agent.Service.exe
│   ├── Netdesk.Agent.Common.dll
│   └── Newtonsoft.Json.dll
└── Updater\
    ├── Netdesk.Agent.Updater.exe
    ├── Netdesk.Agent.Common.dll
    └── Newtonsoft.Json.dll
```

**`Service\` i `Updater\` moraju biti odvojeni folderi.** Auto-update paket
prepisuje samo sadržaj `Service\` — `Updater\` namerno ostaje netaknut jer
Updater ne sme (i ne može, zbog file lock-a) da prepisuje sopstvene fajlove
dok je pokrenut. `Netdesk.Agent.Service.exe` pronalazi Updater po ovoj
konvenciji (rođeni folder pored svog installDir-a) — videti
`UpdateManager.ResolveUpdaterExePath`.

## Preduslovi za build

- Visual Studio 2019+ (ili noviji dotnet SDK sa MSBuild-om) — mora imati
  ".NET Framework 4.5.2 targeting pack" (Visual Studio Installer → Individual
  Components → ".NET Framework 4.5.2 targeting pack" ako fali).
- NuGet pristup internetu (za `Newtonsoft.Json`) prilikom prvog build-a.

**Napomena:** Ovaj kod je pisan i proveren van Windows/Visual Studio okruženja
(nema pristupa punom MSBuild-u/VS-u). Sva tri projekta (Common, Service,
Updater) su uspešno kompajlirana preko samostalnog modernog Roslyn kompajlera
(`csc.exe` iz `Microsoft.Net.Compilers.Toolset` NuGet paketa) protiv pravih
.NET Framework 4.5.2 referenci — to je stvarna kompajl-time provera (tipovi,
reference, sintaksa), ne samo sintaksno čitanje. Ono što OVO NE proverava:
MSBuild/NuGet restore ponašanje, generisanje finalnog .exe/.config preko
Visual Studio-a, i (najbitnije) da li se servis stvarno instalira/pokreće/
zaustavlja na pravoj Windows mašini, i da li ceo enroll→heartbeat→inventory→
job→auto-update tok radi end-to-end protiv pravog backend-a. **Prva stvarna
provera mora da bude ručna, na test mašini/VM-u**, pre distribucije na prave
računare.

## Konfiguracija

Servis čita `%ProgramData%\NetdeskAgent\config.json`. Kopiraj
`Netdesk.Agent.Service\config.example.json` tamo i popuni:

```json
{
  "ServerBaseUrl": "https://<netdesk-server>:3000",
  "EnrollToken": "<AGENT_ENROLL_TOKEN sa backend .env>",
  "HeartbeatIntervalSeconds": 30,
  "InventoryIntervalSeconds": 3600,
  "JobsPollIntervalSeconds": 15,
  "EventLogIntervalSeconds": 300,
  "UpdateCheckIntervalSeconds": 1800,
  "VncLocalPort": 5901
}
```

`VncLocalPort` je port na kom lokalni UltraVNC server sluša (videti sekciju
"Udaljena kontrola ekrana (VNC)" ispod). **Default je namerno 5901, ne
standardni VNC port 5900** - na upravljanim mašinama je 5900 već zauzet
postojećim RealVNC serverom (nezavisna instalacija, van ovog sistema).
UltraVNC treba instalirati/konfigurisati da sluša na 5901 (ili bilo kom
drugom slobodnom portu - mora se samo poklapati sa ovim poljem).

Nakon prve uspešne registracije, agent trajno čuva dobijeni `agentId`/`apiKey`
u `%ProgramData%\NetdeskAgent\state.json` — `EnrollToken` se posle toga više ne
koristi i može se ukloniti iz config-a pri distribuciji na ostale mašine.

Ostali fajlovi u `%ProgramData%\NetdeskAgent\`:
- `logs\agent.log` — log rada agenta
- `eventlog-bookmarks.json` — poslednji pročitan event log record ID (da se
  isti unosi ne šalju ponovo)
- `update-staging\`, `update-backup\` — privremeni fajlovi tokom auto-update-a

## Pokretanje za debug (bez instalacije servisa)

```
Netdesk.Agent.Service.exe --console
```

Radi identičnu petlju kao pravi servis, samo u konzoli (Ctrl+C za izlaz).

## Instalacija kao pravi Windows Service

Preko `InstallUtil.exe` (deo .NET Framework-a), iz `Service\` foldera:

```
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe
sc start NetdeskAgent
```

Servis se instalira pod `LocalSystem` nalogom, `Automatic` startup (podešeno u
`ProjectInstaller.cs`). Automatski restart pri padu servisa nije deo
InstallUtil-a — podešava se posebno:

```
sc failure NetdeskAgent reset=86400 actions=restart/60000/restart/60000/restart/60000
```

Deinstalacija: `InstallUtil.exe /u Netdesk.Agent.Service.exe`.

Updater se ne instalira kao servis — samo se kopira u `Updater\` folder pored
`Service\` (videti raspored instalacije gore); Netdesk.Agent.Service.exe ga
pokreće direktno kao proces kad je update dostupan.

## Auth model (za referencu)

Isti kao backend memorija — enroll ide sa `Authorization: Bearer <EnrollToken>`,
sve posle toga (heartbeat, inventory, jobs, update) sa
`Authorization: Bearer <agentId>:<apiKey>`. Videti
`Netdesk.Agent.Common/Http/NetdeskApiClient.cs`.

## Dozvoljene job komande

`restart_computer`, `shutdown_computer`, `logoff_user`, `restart_service`,
`start_service`, `stop_service` (zahtevaju `payload.serviceName`),
`run_powershell_script` (zahteva `payload.script`), `collect_inventory`,
`refresh_software_list`, `delete_temp_files`. Mora se tačno poklapati sa
backend `COMMAND_TYPES` (`dtos/agentJobs.dto.js`) — videti
`Netdesk.Agent.Common/Jobs/JobExecutor.cs`.

`start_vnc_bridge` je poseban slučaj - kreira ga server programski (ne
ručno biranje tipa komande), ne prolazi kroz `JobExecutor`, i obrađuje ga
`AgentWorker.ProcessJobAsync` direktno. Videti sekciju ispod.

## Udaljena kontrola ekrana (VNC)

Agent sam ne radi screen capture ni input injection - to radi **UltraVNC**
(mora biti instaliran i pokrenut kao Windows servis na svakoj mašini gde
se ova funkcionalnost koristi, vezan **samo na 127.0.0.1**, nikad izložen
na mreži). Agentova uloga je tanak `NetdeskAgent.Common.Vnc.VncBridge` -
kad stigne `start_vnc_bridge` komanda (poslata sa servera nakon što admin
klikne "Uzmi kontrolu ekrana" u UI-u), agent otvara TCP konekciju na
`127.0.0.1:<VncLocalPort>` i WebSocket konekciju ka backend-u
(`/api/agents/vnc-stream?sessionId=N`), pa samo prosleđuje sirove bajtove
(pravi RFB protokol) u oba smera dok jedna od strana ne zatvori konekciju.
Nema GDI-ja, `SendInput`-a, ni WTS/Session 0 workaround-a - obična loopback
TCP konekcija radi identično bez obzira na sesiju u kojoj je servis
pokrenut.

**Instalacija UltraVNC-a na agent mašini je van obima ovog repoa** - nije
deo automatskog build/update procesa (namerno, da se ne dodaje treći
Windows servis u rutinsku, neizanadziranu auto-update petlju). Preuzeti sa
uvnc.com, instalirati kao servis (`winvnc.exe -install`), i podesiti da
sluša samo na loopback (bind adresa ako postoji, ili Windows Firewall
pravilo kao odbrana u dubinu). Ako je backend podešen sa
`VNC_SHARED_PASSWORD`, UltraVNC treba istu lozinku u `ultravnc.ini`;
alternativa je podesiti UltraVNC da ne traži lozinku za loopback konekcije
(stvarna bezbednosna granica je JWT/agent-kredencijali na WS relay sloju,
ne VNC lozinka).

**Port**: standardni VNC port `5900` je na upravljanim mašinama već zauzet
postojećim RealVNC serverom (odvojena instalacija, nevezana za ovaj
sistem) - UltraVNC treba instalirati/konfigurisati na `5901` (default u
`AgentSettings.VncLocalPort`) da ne dođe do konflikta pri bind-u. Ovo je
čisto konfiguracioni izbor - `VncLocalPort` u `config.json` mora se
poklapati sa portom na kom je UltraVNC stvarno podešen, bilo koji slobodan
port radi.

Funkcionalnost je iza `vnc_enabled` app-setting flaga (isključeno po
default-u) - admin ga uključuje na `/config` stranici.
