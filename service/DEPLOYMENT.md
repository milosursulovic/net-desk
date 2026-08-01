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
Microsoft.Diagnostics.Tracing.TraceEvent.dll
Microsoft.Diagnostics.FastSerialization.dll
Dia2Lib.dll
OSExtensions.dll
TraceReloggerLib.dll
System.Runtime.CompilerServices.Unsafe.dll
amd64\ (ceo podfolder - KernelTraceControl.dll, msdia140.dll, msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll)
x86\ (ceo podfolder - isti fajlovi + KernelTraceControl.Win61.dll)
```

**Iz `Netdesk.Agent.Updater\bin\Release\net452\`:**

```
Netdesk.Agent.Updater.exe
Netdesk.Agent.Updater.exe.config
Netdesk.Agent.Common.dll
Newtonsoft.Json.dll
websocket-sharp.dll
Microsoft.Diagnostics.Tracing.TraceEvent.dll
Microsoft.Diagnostics.FastSerialization.dll
Dia2Lib.dll
OSExtensions.dll
TraceReloggerLib.dll
System.Runtime.CompilerServices.Unsafe.dll
amd64\ (isti podfolder kao gore)
x86\ (isti podfolder kao gore)
```

(`websocket-sharp.dll` je dodat zbog VNC bridge-a - videti README.md,
sekcija "Udaljena kontrola ekrana", za razlog. Preostalih 6 DLL-ova su
tranzitivne zavisnosti `Microsoft.Diagnostics.Tracing.TraceEvent` paketa
(DNS query logging - `DnsLogs.DnsQueryCollector`, ETW sesija na
Microsoft-Windows-DNS-Client provajderu). Svi se kopiraju u OBA foldera
kao tranzitivna zavisnost preko `Netdesk.Agent.Common` reference, iako ih
Updater stvarno ne koristi u radu - isti obrazac kao websocket-sharp.dll.
`amd64\`/`x86\` podfolderi sadrže TraceEvent-ove native helper DLL-ove -
managed sklopovi (TraceEvent.dll, Netdesk.Agent.*.dll/.exe) su MSIL/AnyCPU
(potvrđeno uživo preko reflection-a, nema PlatformTarget/Prefer32Bit
ograničenja), pa proces radi ispravno na oba - ali native helperi su
arh-specifični, i proces ih traži u podfolderu koji odgovara njegovoj
stvarnoj bitnosti. `x86\` ima i dodatan `KernelTraceControl.Win61.dll`
(Windows 6.1 = Windows 7 varijanta) - relevantno baš zbog Windows 7 cilja
ovog projekta. Nije uživo potvrđeno da li ih ova konkretna upotreba -
real-time sesija na manifest provajderu, bez kernel provajdera ili .etl
merge-a - uopšte zahteva u praksi (DnsQueryCollector.TryStart() je u
try/catch - ako ipak nedostaju, DNS logging se samo tiho isključi na toj
mašini, ostatak agenta radi normalno), ali oba podfoldera su uključena
preventivno jer je cena zanemarljiva u odnosu na rizik. `arm64\` je
namerno izostavljen - nijedan realan cilj u floti nije ARM.)

`.pdb` fajlovi i `config.example.json` se ne nose na target mašinu (samo debug
simboli / šablon).

## 3. Kopiraj na target mašinu u tačan raspored

```
C:\Program Files\NetdeskAgent\
├── Service\    ← 4 fajla iz Service bin/Release
└── Updater\    ← 4 fajla iz Updater bin/Release
```

**Bitno:** `Service\` i `Updater\` moraju biti odvojeni, rodni folderi. Auto-update
paket kasnije prepisuje samo sadržaj `Service\` — `Updater\` mora ostati netaknut
(Updater ne može da prepiše sopstvene fajlove dok radi).

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

## 7. Provera da li je uspelo

- `services.msc` → "NetdeskAgent" treba da bude **Running**.
- `%ProgramData%\NetdeskAgent\logs\agent.log` → treba da se vidi uspešan enroll
  i redovni heartbeat unosi.
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

Zatim ručno obrisati `C:\Program Files\NetdeskAgent\` i
`%ProgramData%\NetdeskAgent\` ako se čisti do kraja, i (opciono) revoke-ovati
agenta u admin UI-ju.

## Napomena pre šireg rollout-a

Sam `InstallUtil.exe` korak (instalacija kao pravi Windows Service, za razliku
od `--console` debug moda) do sada nije uživo proveren ni na jednoj mašini.
Preporuka: prva instalacija na **jednoj test/pilot mašini**
(`deployment_group='pilot'` u bazi postoji tačno za ovo), praćenje
`agent.log`-a, tek onda širi rollout.
