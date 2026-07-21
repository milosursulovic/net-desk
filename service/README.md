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
verzije, preuzimanje, SHA-256 verifikacija, zamena preko odvojenog Updater
procesa, rollback pri neuspehu).

**Namerno neurađeno** (videti komentare u kodu za detalje):
- Verifikacija digitalnog potpisa paketa — spec ovo pominje kao opciono
  ("mogućnost"); zahtevalo bi code-signing sertifikat/PKI koji ne postoji u
  ovom projektu. SHA-256 integritet se proverava.
- Instalacija sertifikata i odobrenih paketa kao job komande — zahteva poseban
  katalog odobravanja koji nije izgrađen.
- Potpisivanje komandi (11.12).

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
  "UpdateCheckIntervalSeconds": 1800
}
```

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
