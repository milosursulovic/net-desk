# Instalacija Netdesk Agent-a na target računaru

Praktično uputstvo korak-po-korak za instalaciju na jednom upravljanom računaru.
Za arhitekturu, strukturu projekta i digitalni potpis videti `README.md`.

## 0. Preduslov (jednom, na build mašini)

Visual Studio 2019+ sa ".NET Framework 4.5.2 targeting pack"-om (Visual Studio
Installer → Modify → Individual Components, ako fali).

## 1. Build (Release konfiguracija)

U Visual Studio-u:

1. Otvori `Netdesk.Agent.sln`.
2. Solution Configuration (traka sa alatkama) → **Release** (ne Debug).
3. Build → **Rebuild Solution**.

Ili preko komandne linije:

```
dotnet build -c Release
```

Prvi build zahteva internet (NuGet restore za Newtonsoft.Json).

## 2. Pokupi fajlove za kopiranje

**Iz `Netdesk.Agent.Service\bin\Release\net452\`:**

```
Netdesk.Agent.Service.exe
Netdesk.Agent.Service.exe.config
Netdesk.Agent.Common.dll
Newtonsoft.Json.dll
websocket-sharp.dll
WinDivert.dll
WinDivert64.sys
LICENSE-WinDivert.txt
```

**Iz `Netdesk.Agent.Manager\bin\Release\net452\`:**

```
Netdesk.Agent.Manager.exe
Netdesk.Agent.Manager.exe.config
Netdesk.Agent.Common.dll
Newtonsoft.Json.dll
websocket-sharp.dll
```

(`websocket-sharp.dll` je dodat zbog VNC bridge-a - videti README.md,
sekcija "Udaljena kontrola ekrana", za razlog. Kopira se u OBA foldera kao
tranzitivna zavisnost preko `Netdesk.Agent.Common` reference, iako ga
Manager stvarno ne koristi u radu.

`WinDivert.dll`/`WinDivert64.sys`/`LICENSE-WinDivert.txt` su SAMO u Service
folderu (Manager ne radi DNS logging) - od verzije 1.5.7, DNS query logging
koristi WinDivert paketno snimanje (vidi README.md "DNS query logging"
sekciju za punu istoriju ETW→Npcap→WinDivert migracije). Za razliku od
Npcap-a, WinDivert NE traži poseban instalacioni korak/preset - drajver se
sam, tiho instalira pri prvom pozivu iz agenta, dovoljno je da ova dva
fajla samo stoje pored `.exe`-a (već podešeno u `.csproj`-u da se kopiraju
automatski pri build-u). VAŽNO OGRANIČENJE: WinDivert radi samo na
Windows 10/11/Server - na Windows 7 mašinama DNS logging ostaje isključen
(TryStart() tiho vrati false), ostatak agenta radi normalno.

`Microsoft.Diagnostics.Tracing.TraceEvent` paket (ETW-bazirani DNS logging
do verzije 1.5.5, i njegovih 6 tranzitivnih DLL-ova +
`amd64\`/`x86\`/`arm64\` native helper podfoldera) je potpuno UKLONJEN.)

`.pdb` fajlovi i `config.example.json` se ne nose na target mašinu (samo debug
simboli / šablon).

## 3. Kopiraj na target mašinu u tačan raspored

```
C:\Program Files\NetdeskAgent\
├── Service\    ← fajlovi iz Service bin/Release
└── Manager\    ← fajlovi iz Manager bin/Release
```

**Bitno:** `Service\` i `Manager\` moraju biti odvojeni, rodni folderi. Auto-update
paket kasnije prepisuje samo sadržaj `Service\` — `Manager\` mora ostati netaknut
(Manager ne može da prepiše sopstvene fajlove dok radi). Za instalaciju na
POSTOJEĆU flotu (ne prvu pilot mašinu), preskoči ručno kopiranje/InstallUtil
korake ispod za Manager - koristi umesto toga preset "Instaliraj/ažuriraj
NetdeskAgent Manager servis" poslat kao `run_powershell_script` job (videti
`README.md`, sekcija "Netdesk Agent Manager").

## 4. Proveri preduslove na target mašini

- .NET Framework 4.5.2+ (Windows 10 ga već ima; na Windows 7 SP1 proveri da je
  instaliran).
- Organizaciona root CA (mkcert) već u trusted root store-u — treba da važi za
  sve upravljane računare.
- Mrežni pristup ka `https://<netdesk-server>:3000`.

## 5. Napravi config.json na target mašini

Kreiraj folder `%ProgramData%\NetdeskAgent\` i u njemu `config.json`:

```json
{
  "ServerBaseUrl": "https://<netdesk-server>:3000",
  "EnrollToken": "<AGENT_ENROLL_TOKEN iz backend .env>",
  "HeartbeatIntervalSeconds": 30,
  "InventoryIntervalSeconds": 3600,
  "JobsPollIntervalSeconds": 15,
  "EventLogIntervalSeconds": 300,
  "DnsLogIntervalSeconds": 300,
  "UpdateCheckIntervalSeconds": 1800
}
```

Nakon prve uspešne registracije agent trajno čuva `agentId`/`apiKey` u
`%ProgramData%\NetdeskAgent\state.json` — `EnrollToken` se posle toga više ne
koristi i može se izbaciti iz config-a pri distribuciji na ostale mašine.

## 6. Instaliraj servis (CMD/PowerShell kao Administrator)

**Bitno - `InstallUtil.exe` putanja zavisi od bitnosti OS-a na target
mašini** (ne od bitnosti agenta - sklopovi su MSIL/AnyCPU i rade na oba,
ali `InstallUtil.exe` sam postoji u dve odvojene instalacije koje Windows
instalira zavisno od svoje bitnosti - `Framework64` folder NE POSTOJI na
pravom 32-bit Windows-u):

- **64-bit Windows:**
  ```
  cd "C:\Program Files\NetdeskAgent\Service"
  %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe
  ```
- **32-bit Windows:**
  ```
  cd "C:\Program Files\NetdeskAgent\Service"
  %WINDIR%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe
  ```

Zatim u oba slučaja:
```
sc start NetdeskAgent
sc failure NetdeskAgent reset=86400 actions=restart/60000/restart/60000/restart/60000
```

Servis se instalira pod `LocalSystem` nalogom, `Automatic` startup. Poslednja
komanda (`sc failure`) podešava automatski restart pri padu servisa — to
`InstallUtil` ne radi sam.

**Isti postupak, posebno, za Manager** (samo na PRVOJ pilot mašini - za ostatak
flote koristi preset iz koraka 3 iznad):

- **64-bit Windows:**
  ```
  cd "C:\Program Files\NetdeskAgent\Manager"
  %WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe Netdesk.Agent.Manager.exe
  ```
- **32-bit Windows:**
  ```
  cd "C:\Program Files\NetdeskAgent\Manager"
  %WINDIR%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe Netdesk.Agent.Manager.exe
  ```

Zatim:
```
sc start NetdeskAgentManager
sc failure NetdeskAgentManager reset=86400 actions=restart/60000/restart/60000/restart/60000
```

## 7. Provera da li je uspelo

- `services.msc` → "NetdeskAgent" I "NetdeskAgent Manager" treba da budu
  **Running**.
- `%ProgramData%\NetdeskAgent\logs\agent.log` → treba da se vidi uspešan enroll
  i redovni heartbeat unosi.
- `%ProgramData%\NetdeskAgent\logs\manager.log` → treba da se vidi "Netdesk
  Agent Manager se pokreće...".
- Admin UI (`/agents` na frontend-u) → treba da se pojavi novi agent sa
  hostname-om te mašine.

## Deinstalacija

```
cd "C:\Program Files\NetdeskAgent\Service"
sc stop NetdeskAgent
```

Zatim isti `InstallUtil.exe` (64-bit ili 32-bit putanja, videti korak 6)
sa `/u`:
```
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe /u Netdesk.Agent.Service.exe
```

Isto za Manager (druga fascikla/exe, isti obrazac):
```
cd "C:\Program Files\NetdeskAgent\Manager"
sc stop NetdeskAgentManager
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe /u Netdesk.Agent.Manager.exe
```

Zatim ručno obrisati `C:\Program Files\NetdeskAgent\` i
`%ProgramData%\NetdeskAgent\` ako se čisti do kraja, i (opciono) revoke-ovati
agenta u admin UI-ju.

## Napomena pre šireg rollout-a

Sam `InstallUtil.exe` korak (instalacija kao pravi Windows Service, za razliku
od `--console` debug moda) do sada nije uživo proveren ni na jednoj mašini.
Dodatno, NOVO za Manager: sam signaling put (`ServiceController.
ExecuteCommand` → `OnCustomCommand`, kod 128) između NetdeskAgent i
NetdeskAgentManager procesa takođe nije uživo proveren - ovo je baš deo koji
rešava originalni problem (IPS/EDR na mrežnom putu je ranije kidao stariji
"detached hidden shell" restart pokušaj), pa je najvrednije za proveru uživo
na pilot mašini. Preporučen redosled: instaliraj oba servisa → pošalji
"Restartuj servis" job sa `serviceName=NetdeskAgent` iz admin UI-ja → potvrdi
u `manager.log`/`agent.log` i admin UI-ju (agent ode offline pa se vrati
online) → testiraj pravi update end-to-end → tek onda širi rollout
(`deployment_group='pilot'` u bazi postoji tačno za ovaj korak).

**Za 1.5.7 (WinDivert DNS logging)**: potpuno nov, uživo neproveren capture
put (vidi README.md "DNS query logging" sekciju za punu istoriju
ETW→Npcap→WinDivert migracije - Npcap pokušaj u 1.5.6 je odbačen jer je
tihi instalacioni mod dostupan samo uz plaćeno "Npcap OEM" izdanje).
NEMA posebnog instalacionog koraka/preseta ovog puta - `WinDivert.dll`/
`WinDivert64.sys` putuju UNUTAR release paketa (deo Service foldera),
drajver se sam instalira pri prvom pozivu. Redosled na pilot mašini:
pošalji `force_reinstall_agent`/normalan update na 1.5.7 (**Windows 10/11
mašina - WinDivert ne podržava Windows 7**) → generiši malo DNS saobraćaja
na toj mašini (npr. otvori par sajtova) → proveri `/dns-logs` u frontend-u
da se domeni pojavljuju za tog agenta → proveri `agent.log` za
"WinDivert DNS capture pokrenut" liniju (potvrda da `TryStart()` nije tiho
otkazao).
