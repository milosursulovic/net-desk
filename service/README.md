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
odvojenog NetdeskAgentManager servisa, rollback pri neuspehu - videti sekciju
"Netdesk Agent Manager" ispod).

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
                          kolektori (Inventory/Monitoring/EventLogs/DnsLogs),
                          job executor, update manager, manager mailbox
                          protokol, config/state/logger
Netdesk.Agent.Service/    Netdesk.Agent.Service.exe - Windows Service
Netdesk.Agent.Manager/    Netdesk.Agent.Manager.exe - odvojen, TRAJAN Windows
                          Service koji na komandu start/stop/restart-uje
                          NetdeskAgent i fizički menja fajlove pri update-u -
                          videti sekciju "Netdesk Agent Manager" ispod
```

## Raspored instalacije (bitno za auto-update)

```
C:\Program Files\NetdeskAgent\
├── Service\
│   ├── Netdesk.Agent.Service.exe
│   ├── Netdesk.Agent.Common.dll
│   ├── Newtonsoft.Json.dll
│   ├── websocket-sharp.dll
│   ├── Microsoft.Diagnostics.Tracing.TraceEvent.dll
│   ├── Microsoft.Diagnostics.FastSerialization.dll
│   ├── Dia2Lib.dll
│   ├── OSExtensions.dll
│   ├── TraceReloggerLib.dll
│   ├── System.Runtime.CompilerServices.Unsafe.dll
│   ├── amd64\ (KernelTraceControl.dll, msdia140.dll, msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll)
│   └── x86\ (isti fajlovi + KernelTraceControl.Win61.dll)
└── Manager\
    ├── Netdesk.Agent.Manager.exe
    ├── Netdesk.Agent.Common.dll
    ├── Newtonsoft.Json.dll
    ├── websocket-sharp.dll
    ├── Microsoft.Diagnostics.Tracing.TraceEvent.dll
    ├── Microsoft.Diagnostics.FastSerialization.dll
    ├── Dia2Lib.dll
    ├── OSExtensions.dll
    ├── TraceReloggerLib.dll
    ├── System.Runtime.CompilerServices.Unsafe.dll
    ├── amd64\ (isti podfolder kao gore)
    └── x86\ (isti podfolder kao gore)
```

`websocket-sharp.dll` (paket `WebSocketSharp-netstandard`) je dodat zbog
`VncBridge`-a - videti napomenu u sekciji "Udaljena kontrola ekrana"
ispod za razlog (`System.Net.WebSockets.ClientWebSocket` ne radi na
Windows 7). Preostalih 6 DLL-ova su tranzitivne zavisnosti paketa
`Microsoft.Diagnostics.Tracing.TraceEvent` (DNS query logging - videti
sekciju "DNS query logging" ispod), pinovanog na 2.0.77 jer je to
poslednja verzija koja i dalje isporučuje `net45` lib target (3.x+ je
samo `netstandard2.0`/`net462+`, ni jedno net452 ne može da konzumira).
MSBuild sve ovo kopira u oba foldera (tranzitivna zavisnost preko
`Netdesk.Agent.Common.dll`) iako ih `Manager.exe` stvarno ne koristi u
radu - bezopasno, samo dodatni fajlovi. `amd64\`/`x86\` podfolderi
(native helper DLL-ovi, arh-specifični - managed sklopovi su MSIL/AnyCPU
i rade na oba, ali proces traži native helpere u podfolderu koji
odgovara SVOJOJ stvarnoj bitnosti) su uključeni preventivno - nije uživo
potvrđeno da li ih plain real-time ETW sesija na manifest provajderu (bez
kernel provajdera ili .etl merge-a) uopšte zahteva u praksi, ali je cena
zanemarljiva. `x86\` je posebno bitan zbog `KernelTraceControl.Win61.dll`
(Windows 7 varijanta) - baš ono što ovaj projekat cilja.

**`Service\` i `Manager\` moraju biti odvojeni folderi.** Auto-update paket
prepisuje samo sadržaj `Service\` — `Manager\` namerno ostaje netaknut jer
Manager ne sme (i ne može, zbog file lock-a) da prepisuje sopstvene fajlove
dok je pokrenut. `Netdesk.Agent.Service.exe` ne zna/ne mora da zna gde
Manager fizički živi (za razliku od starog `ResolveUpdaterExePath` obrasca) -
komunikacija ide isključivo preko mailbox fajla i Windows Service imena
(`NetdeskAgentManager`), ne preko putanje na disku - videti sekciju "Netdesk
Agent Manager" ispod.

## Preduslovi za build

- Visual Studio 2019+ (ili noviji dotnet SDK sa MSBuild-om) — mora imati
  ".NET Framework 4.5.2 targeting pack" (Visual Studio Installer → Individual
  Components → ".NET Framework 4.5.2 targeting pack" ako fali).
- NuGet pristup internetu (za `Newtonsoft.Json`) prilikom prvog build-a.

**Napomena:** Ovaj kod je pisan van Windows/Visual Studio GUI okruženja, ali
`dotnet build -c Release` (moderna .NET SDK CLI) je uživo potvrđeno da
uspešno build-uje sva četiri projekta (Common, Service, Manager, i ranije
Updater) na ovom net452 target-u - stvarna MSBuild kompajl-time provera
(tipovi, reference, NuGet restore), ne samo sintaksno čitanje. Ono što ovo I
DALJE ne proverava: da li se servis stvarno instalira/pokreće/zaustavlja na
pravoj Windows mašini preko `InstallUtil.exe`, da li `ServiceController.
ExecuteCommand`/`OnCustomCommand` signal stvarno stiže između dva procesa, i
da li ceo enroll→heartbeat→inventory→job→auto-update tok radi end-to-end
protiv pravog backend-a. **Prva stvarna provera mora da bude ručna, na test/
pilot mašini**, pre distribucije na celu flotu.

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
  "DnsLogIntervalSeconds": 300,
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
- `logs\agent.log` — log rada NetdeskAgent servisa
- `logs\manager.log` — log rada NetdeskAgentManager servisa (odvojen fajl -
  oba servisa rade istovremeno, videti sekciju "Netdesk Agent Manager")
- `manager-command.json` — mailbox fajl, NetdeskAgent → Manager komande
  (postoji samo dok komanda čeka da bude obrađena)
- `eventlog-bookmarks.json` — poslednji pročitan event log record ID (da se
  isti unosi ne šalju ponovo)
- `update-staging\`, `update-backup\` — privremeni fajlovi tokom auto-update-a

## Pokretanje za debug (bez instalacije servisa)

```
Netdesk.Agent.Service.exe --console
```

Radi identičnu petlju kao pravi servis, samo u konzoli (Ctrl+C za izlaz).

## Instalacija kao pravi Windows Service

Preko `InstallUtil.exe` (deo .NET Framework-a), iz `Service\` foldera.
**Putanja zavisi od bitnosti OS-a na target mašini** (sklopovi su MSIL/
AnyCPU i rade na oba, ali `Framework64` folder ne postoji na pravom
32-bit Windows-u):

```
:: 64-bit Windows
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe

:: 32-bit Windows
%WINDIR%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe
```

```
sc start NetdeskAgent
```

Servis se instalira pod `LocalSystem` nalogom, `Automatic` startup (podešeno u
`ProjectInstaller.cs`). Automatski restart pri padu servisa nije deo
InstallUtil-a — podešava se posebno:

```
sc failure NetdeskAgent reset=86400 actions=restart/60000/restart/60000/restart/60000
```

Deinstalacija: isti `InstallUtil.exe` (64-bit ili 32-bit putanja iznad) sa
`/u Netdesk.Agent.Service.exe`.

**Manager se INSTALIRA kao pravi Windows Service** (za razliku od starog
Updater-a) — isti InstallUtil postupak kao gore, samo nad
`Netdesk.Agent.Manager.exe` u `Manager\` folderu i sa `NetdeskAgentManager`
imenom servisa. Za rollout na celu postojeću flotu, preporučen put je preset
"Instaliraj/ažuriraj NetdeskAgent Manager servis"
(`frontend/src/constants/powershellPresets.js`) poslat kao
`run_powershell_script` job preko postojećih agenata (prvo `pilot` grupa) -
radi ceo InstallUtil/`sc failure` postupak automatski. Ručni koraci iznad
ostaju kao fallback za prvu pilot mašinu.

## Auth model (za referencu)

Isti kao backend memorija — enroll ide sa `Authorization: Bearer <EnrollToken>`,
sve posle toga (heartbeat, inventory, jobs, update) sa
`Authorization: Bearer <agentId>:<apiKey>`. Videti
`Netdesk.Agent.Common/Http/NetdeskApiClient.cs`.

## Dozvoljene job komande

`restart_computer`, `shutdown_computer`, `logoff_user`, `restart_service`,
`start_service`, `stop_service` (zahtevaju `payload.serviceName`),
`start_netdesk_agent`, `stop_netdesk_agent`, `restart_netdesk_agent` (bez
payload-a - cilj je uvek NetdeskAgent), `run_powershell_script` (zahteva
`payload.script`), `collect_inventory`, `refresh_software_list`,
`delete_temp_files`. Mora se tačno poklapati sa backend `COMMAND_TYPES`
(`dtos/agentJobs.dto.js`) — videti `Netdesk.Agent.Common/Jobs/JobExecutor.cs`.

`start_vnc_bridge` i `force_reinstall_agent` su posebni slučajevi - kreira ih
server/frontend programski (ne ručno biranje tipa komande), ne prolaze kroz
`JobExecutor`, i obrađuje ih `AgentWorker.ProcessJobAsync` direktno
(`force_reinstall_agent` poziva `UpdateManager.ForceInstallAsync` - videti
sekciju "Netdesk Agent Manager" ispod).

`start_netdesk_agent`/`stop_netdesk_agent`/`restart_netdesk_agent` su glavni,
preporučeni put za RUČNO upravljanje NetdeskAgent servisom - uvek idu preko
NetdeskAgentManager-a (mailbox), nikad kroz `JobExecutor` direktno. Kao
odbrana u dubinu, i generički `restart_service`/`start_service`/
`stop_service` sa `payload.serviceName = "NetdeskAgent"` (case-insensitive)
se TIHO PREUSMERAVAJU na isti put (`AgentWorker.IsNetdeskAgentServiceControl`)
umesto da idu kroz `JobExecutor` - agent ne sme sam sebe da (re)startuje
sinhrono na istoj petlji koja treba da prijavi rezultat serveru. Za SVAKI
DRUGI naziv servisa, `JobExecutor.ControlService` radi nepromenjeno.

## Netdesk Agent Manager

Odvojen, TRAJAN Windows Service (`NetdeskAgentManager`, `Netdesk.Agent.
Manager.exe`) - jedini razlog postojanja je da NetdeskAgent.Service.exe
nikad ne mora sam sebe da (re)startuje ili menja sopstvene fajlove dok je
pokrenut. "Postavi i zaboravi" komponenta - nema svoju auto-update logiku,
rollout je ručan preko preseta (videti "Instalacija kao pravi Windows
Service" iznad).

**Komunikacija (NetdeskAgent → Manager):**
1. NetdeskAgent piše `ManagerCommand` JSON u `%ProgramData%\NetdeskAgent\
   manager-command.json` (atomic rename preko `.tmp` fajla - Manager nikad
   ne čita polu-napisan fajl). Jedna pending komanda odjednom, ne red
   čekanja (namerno prihvaćen kompromis za v1 - dat realan tempo jobova ovo
   je nizak rizik).
2. NetdeskAgent zove `new ServiceController("NetdeskAgentManager").
   ExecuteCommand(128)` - Windows Service custom control code, "probudi se
   i proveri mailbox" (kod 128, `ManagerCommandClient.CustomCommandCode`).
   Neuspeh ovog poziva (npr. Manager trenutno nije pokrenut) NIJE fatalan -
   komanda već čeka u fajlu.
3. Manager-ov `OnCustomCommand(128)` samo signalizira event (mora brzo da
   vrati kontrolu SCM-u) - `ManagerWorker`-ova radna petlja ga obrađuje.
   Manager TAKOĐE nezavisno pollduje isti fajl na svaki tick (5s) - safety
   net ako je custom command signal izgubljen (npr. Manager je bio ugašen
   kad je komanda upisana).

**Dve akcije (`ManagerCommand.Action`):**
- `control_service` - `ServiceName`/`ServiceAction` ("start"/"stop"/
  "restart"). `ServiceName` NIJE hardkodovan na "NetdeskAgent" - Manager ume
  da kontroliše bilo koji naziv servisa (trenutno se koristi samo za
  NetdeskAgent, ali mehanizam sam po sebi je generički).
- `install_files` - `StagingDir`/`InstallDir`/`BackupDir` (proizvoljne
  putanje, NISU hardkodovane na Service folder), `ServiceName` (koji servis
  zaustaviti/pokrenuti oko kopiranja), i OPCIONO `ServerBaseUrl`/`AgentId`/
  `ApiKey`/`FromVersion`/`ToVersion` (samo ako pošiljalac želi da Manager
  javi rezultat serveru - videti ispod). Manager: **prvo eksplicitno
  proverava da je stop servisa uspeo** (`TryControlService`) - ako NIJE,
  fajlovi se uopšte ne diraju, javlja se jasan neuspeh sa razlogom, kraj. Tek
  ako je stop uspeo: backup `InstallDir` u `BackupDir` (rekurzivno,
  `DirectorySync` - ispravlja stari bug gde Updater nije kopirao `amd64\`/
  `x86\` podfoldere) → kopira `StagingDir` preko `InstallDir`-a → start
  servisa. Na grešku POSLE uspešnog stop-a: rollback iz backup-a + ponovni
  start pre javljanja neuspeha (isti oblik kao stari Updater). Mehanizam NIJE
  vezan za NetdeskAgent specifično - iste tri putanje + naziv servisa mogu u
  budućnosti da instaliraju/ažuriraju BILO KOJU komponentu na BILO KOJOJ
  lokaciji (npr. potpuno odvojen folder/servis van `C:\Program
  Files\NetdeskAgent\`), bez izmene Manager koda. Trenutna (NetdeskAgent)
  upotreba ne dira `config.json` - živi van `InstallDir`-a.

  Ako je `ServerBaseUrl` popunjen, Manager posle (uspeha ili neuspeha) javlja
  rezultat serveru (`POST /api/agents/update/report`) - JEDINI mrežni poziv
  koji Manager ikad pravi (zato ima sopstveno outbound firewall pravilo,
  isti razlog kao NetdeskAgent-ovo). Ako `ServerBaseUrl` NIJE popunjen
  (buduća ne-agent upotreba), ovaj korak se tiho preskače.

**Forsirana reinstalacija** (`force_reinstall_agent` job, pokreće se iz
"Forsiraj reinstalaciju" dugmeta na `/agent-releases` stranici) ide istim
`install_files` putem, samo BEZ `isNewerVersion` provere - može
"reinstalirati" i verziju na kojoj agent VEĆ tvrdi da je (popravka oštećene
instalacije). Digitalni potpis se u ovom slučaju ne proverava (job payload
ne nosi ga) - SHA-256 integritet i dalje obavezno važi.

**Nije uživo provereno** (isti razlog kao ostatak agenta): da
`ServiceController.ExecuteCommand`/`OnCustomCommand` signal stvarno stiže
između dva procesa na pravoj Windows mašini, i da ceo stop→copy→start
ciklus ne ostavlja mašinu u pokvarenom stanju. Prva provera mora biti na
pilot mašini - videti `DEPLOYMENT.md`.

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

**WebSocket klijent (Windows 7 napomena)**: `VncBridge` koristi
**websocket-sharp** (`WebSocketSharp-netstandard` NuGet paket), NE
`System.Net.WebSockets.ClientWebSocket` - otkriveno uživo na pravoj
Windows 7 mašini: `ClientWebSocket` baca `PlatformNotSupportedException`
tamo, jer zavisi od WinHTTP WebSocket API-ja koji ne postoji pre
Windows 8. websocket-sharp implementira RFB 6455 protokol sam, nad sirovim
soketima, bez te OS zavisnosti - a Windows 7 podrška je baš razlog zašto
ovaj projekat cilja `net452` (videti vrh ovog fajla), pa je ovo bio pravi
blocker, ne kozmetička razlika. Posledica: ova biblioteka nema javni API za
proizvoljne custom HTTP header-e pri handshake-u, pa agent šalje
`agentId`/`apiKey` kao query string (`?agentId=...&apiKey=...`) umesto
`Authorization` header-a - isti obrazac koji je viewer strana (browser)
već morala da koristi iz istog razloga (browser-ov WebSocket API takođe ne
dozvoljava custom header-e), i ista bezbednosna napomena važi (ruta ide
kroz `server.on("upgrade")`, ne kroz Express/morgan, pa se ne loguje u
access log).

## DNS query logging

`NetdeskAgent.Common.DnsLogs.DnsQueryCollector` prati DNS upite ove mašine
preko **Npcap paketnog snimanja** (direktan P/Invoke nad `wpcap.dll`, vidi
`PcapInterop.cs` - NE preko SharpPcap/PacketDotNet NuGet paketa, nijedna
njihova verzija ne isporučuje net4x lib target, samo `netstandard2.0`, što
net452 ne može da konzumira). Od verzije 1.5.6 - ranije (1.5.5 i pre) je
koristio ugrađeni Windows ETW `Microsoft-Windows-DNS-Client` provajder, ali
se uživo pokazalo da to nije dovoljno: ETW vidi SAMO upite koji prođu kroz
Windows-ov OS resolver API - aplikacija (ili malware) koja sama otvori UDP
socket i pošalje sirov upit na port 53 (tačan obrazac za C2 beaconing/DNS
tunneling, baš ono što ovaj feature treba da uhvati) je ETW-u potpuno
nevidljiva. Paketno snimanje vidi svaki paket na žici, nezavisno od API-ja.

Zahteva **Npcap instaliran na mašini** (vidi `install-npcap` PowerShell
preset, `frontend/src/constants/powershellPresets.js`) - ako nije, ili ako
je verzija agenta starija od 1.5.6, `TryStart()` tiho vrati `false` i DNS
logging ostaje isključen tog rada agenta (ne obara ostatak agenta, isti
ugovor kao stara ETW verzija). Instalacija se namerno radi SA
`/winpcap_mode=yes` (wpcap.dll ide u System32, default DLL search path -
agent-ov P/Invoke ga tako nalazi bez dodatnog oslanjanja na
`SetDllDirectory` fallback) i `/dot11_support=yes` (sirov 802.11/monitor
mode podrška na drajver nivou - agent je trenutno NE koristi, samo ostaje
dostupna za buduću upotrebu bez ponovne reinstalacije).

Hvata SAMO odlazne UDP upite ove mašine (`promisc=0`, BPF filter
`"ip and udp dst port 53"`) - namerno ne i DNS odgovore (dupliralo bi
brojanje istog upita) i namerno ne ceo mrežni segment (forenzika PO
računaru, ne mrežni IDS/monitor mode capture drugih uređaja). TCP DNS
(port 53 preko TCP - retko u praksi, obično samo veliki/zone-transfer
odgovori) je van obima v1 - zahtevao bi TCP stream reassembly.

Pokreće se JEDNOM pri startu servisa (ne po tick-u kao ostali kolektori) -
capture niti (jedna po mrežnom uređaju) moraju da rade kontinuirano da ne
propuste upite između sync ciklusa. `AgentWorker` periodično
(`DnsLogIntervalSeconds`, podrazumevano 300s) uzima nakupljeno stanje
(agregirano po domenu - broj upita, prvi/poslednji put viđen, ne jedan red
po pojedinačnom upitu) i šalje preko istog `/api/agents/inventory` kanala
kao event logovi.

**Bezbednosna namena**: nema firewall/NDR rešenja u mreži - ovo je jedina
vidljivost u DNS-nivo pretnje (malware C2 beaconing, DNS tunneling/
exfiltracija, phishing domeni). Backend čuva agregat po (računar, domen) u
`computer_dns_queries`, prikazano na `/dns-logs` (admin-only, pretraživo po
domenu) u frontend-u. Namerno BEZ aktivnog alerting-a protiv blocklist-e u
ovoj iteraciji - samo skladištenje + pretraga za naknadnu forenziku.

**Nije uživo provereno** (isti razlog kao i za ostatak agenta - nema
Windows/admin/mrežnog okruženja u sandboxu): da Npcap capture stvarno hvata
upite u praksi na realnoj mašini, da `/winpcap_mode=yes` instalacija zaista
stavlja `wpcap.dll` na mesto koje P/Invoke očekuje, i da DNS paket parsing
(ručno pisan, bez PacketDotNet-a - Ethernet/VLAN/IPv4/UDP/DNS offset-i u
`DnsQueryCollector.TryExtractQueryName`) tačno radi na realnom saobraćaju.
Kod kompajlira čisto (`dotnet build`) i granice-proverava svaki paket
(kopira u upravljan niz pre parsiranja, try/catch po paketu) - ali prva
stvarna provera mora biti ručna, na test/pilot mašini (instaliraj Npcap
preko preseta, pošalji 1.5.6 na jednog agenta, proveri `/dns-logs` da se
pojavljuju domeni), pre šireg rollout-a.
