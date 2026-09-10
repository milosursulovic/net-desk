# Netdesk Agent (Windows Service)

The client-side component from `Netdesk Agent - Tehnička specifikacija.pdf` —
a Windows service installed on every supported computer that communicates
with the Netdesk server (`backend/`) over HTTPS. A separate project/stack
from `backend/` and `frontend/` — C#, .NET Framework 4.5.2 (for Windows 7
support).

## Status

All phases from the specification are implemented: enrollment, heartbeat,
monitoring, inventory sync (hardware/software/services/Windows Update/
printers via WMI and the registry), job polling/execution (restart/
shutdown/logoff/services/PowerShell/deleting temp files), event log sync,
and auto-update (version check, download, SHA-256 + digital signature
verification, swap via a separate NetdeskAgentManager service, rollback on
failure - see the "Netdesk Agent Manager" section below).

**Deliberately not done** (see code comments for details):
- Installing certificates and approved packages as job commands — requires
  a separate approval catalog that hasn't been built.
- Signing commands (11.12) — currently only update packages are signed, not
  individual job commands.

## Digital signature for update packages

Since the organization has already distributed an internal root CA into
the trusted root store of every managed computer (used for HTTPS to the
Netdesk server), signature verification is based on that same CA — there's
no need to separately distribute a public key to the agent.

**Server-side setup** (`backend/.env`):

```
AGENT_SIGNING_CERT_PATH=path/to/code-signing-certificate.pem
AGENT_SIGNING_KEY_PATH=path/to/private-key.pem
```

The certificate must be **issued by the same internal CA** that's already
in the computers' trusted root store (it doesn't have to be the same
certificate used for HTTPS - a dedicated code-signing certificate is
preferable, but it must share the same CA chain-to-root). If these two env
vars aren't set, release packages still upload normally, just unsigned
(the agent then only checks SHA-256, as before) — signing is optional, per
the spec's "capability" wording.

**How it works:**
1. On upload, the server signs the package's raw bytes (`RSA-SHA256`,
   `utils/agentSigning.js`) and stores the signature in
   `agent_releases.signature`.
2. `GET /api/agents/update` returns both `signature` and
   `signatureCertificatePem` (the public certificate, not the private key).
3. The agent (`UpdateManager.VerifySignatureIfPresent`), after the SHA-256
   check:
   - builds an `X509Chain` from the received certificate and checks that it
     leads to a trusted root (already present on the machine) -
     `X509RevocationMode.NoCheck` since the organization likely has no
     CRL/OCSP for the internal CA,
   - verifies the RSA signature over the downloaded file.
   - If the certificate/package has no signature (the server has no
     signing configured), the check is skipped and the update proceeds with
     just the SHA-256 confirmation.
   - If a signature was sent but verification (the chain or the signature
     itself) fails, the update is reliably rejected.

**Note on .NET Framework 4.5.2 compatibility:** verification uses the older
`RSACryptoServiceProvider.VerifyData(byte[], string, byte[])` API, NOT
`RSA.VerifyData(..., HashAlgorithmName, RSASignaturePadding)` or
`X509Certificate2.GetRSAPublicKey()` - both were only added in .NET
Framework 4.6 and don't exist on 4.5.2 (the Windows 7 target).

**Tested in this session** (outside a real Windows/Visual Studio
environment): generated a test self-signed certificate, signed a test
package via the same Node.js logic used in `agentSigning.js`, and verified
it via identical C# code to `UpdateManager` (including the whole HTTP
round trip - a real upload → a real `/api/agents/update` response → a real
download → successful verification, plus confirming that deliberately
tampered/corrupted content correctly fails the check). **X509Chain
verification against a real trusted root CA was not tested** - that
requires an actual Windows machine with your internal CA already
installed, which this sandboxed environment doesn't have.

## Structure

```
Netdesk.Agent.sln
Netdesk.Agent.Common/     shared code - models, HTTP client, WMI/registry
                          collectors (Inventory/Monitoring/EventLogs/DnsLogs),
                          job executor, update manager, manager mailbox
                          protocol, config/state/logger
Netdesk.Agent.Service/    Netdesk.Agent.Service.exe - Windows Service
Netdesk.Agent.Manager/    Netdesk.Agent.Manager.exe - a separate, PERMANENT
                          Windows Service that start/stop/restarts
                          NetdeskAgent on command and physically swaps files
                          during an update - see the "Netdesk Agent Manager"
                          section below
```

## Install layout (relevant to auto-update)

```
C:\Program Files\NetdeskAgent\
├── Service\
│   ├── Netdesk.Agent.Service.exe
│   ├── Netdesk.Agent.Service.exe.config
│   ├── Netdesk.Agent.Common.dll
│   ├── Newtonsoft.Json.dll
│   ├── websocket-sharp.dll
│   ├── WinDivert.dll
│   ├── WinDivert64.sys
│   └── LICENSE-WinDivert.txt
└── Manager\
    ├── Netdesk.Agent.Manager.exe
    ├── Netdesk.Agent.Manager.exe.config
    └── Newtonsoft.Json.dll
```

`websocket-sharp.dll` (the `WebSocketSharp-netstandard` package) was added
for `VncBridge` - see the note in the "Remote screen control" section
below for why (`System.Net.WebSockets.ClientWebSocket` doesn't work on
Windows 7). `WinDivert.dll`/`WinDivert64.sys`/`LICENSE-WinDivert.txt` are
for DNS query logging - see the "DNS query logging" section below (the
`Microsoft.Diagnostics.Tracing.TraceEvent` package, ETW-based DNS logging
up to version 1.5.5, has been fully removed, along with all 6 transitive
DLLs and the `amd64\`/`x86\` native helper subfolders).

`Manager\` does NOT have `Netdesk.Agent.Common.dll` or
`websocket-sharp.dll` - see the "Netdesk Agent Manager" section below: the
Manager has its own FileLogger/Paths/ManagerCommand/DirectorySync,
deliberately separate from `Netdesk.Agent.Common` so an Agent update can
never break the Manager and vice versa (WinDivert included - the Manager
doesn't do DNS logging).

**`Service\` and `Manager\` must be separate folders.** The auto-update
package only overwrites the contents of `Service\` — `Manager\`
deliberately stays untouched since the Manager must not (and, due to file
locks, cannot) overwrite its own files while running.
`Netdesk.Agent.Service.exe` doesn't know/need to know where the Manager
physically lives (unlike the old `ResolveUpdaterExePath` pattern) -
communication happens exclusively via the mailbox file and the Windows
Service name (`NetdeskAgentManager`), not a path on disk - see the
"Netdesk Agent Manager" section below.

## Build prerequisites

- Visual Studio 2019+ (or a newer dotnet SDK with MSBuild) — must have the
  ".NET Framework 4.5.2 targeting pack" (Visual Studio Installer →
  Individual Components → ".NET Framework 4.5.2 targeting pack" if
  missing).
- NuGet internet access (for `Newtonsoft.Json`) on the first build.

**Note:** This code was written outside a Windows/Visual Studio GUI
environment, but `dotnet build -c Release` (the modern .NET SDK CLI) has
been confirmed live to successfully build all four projects (Common,
Service, Manager, and previously Updater) on this net452 target - a real
MSBuild compile-time check (types, references, NuGet restore), not just a
syntax read. What this STILL doesn't verify: whether the service actually
installs/starts/stops on a real Windows machine via `InstallUtil.exe`,
whether the `ServiceController.ExecuteCommand`/`OnCustomCommand` signal
actually arrives between the two processes, and whether the whole
enroll→heartbeat→inventory→job→auto-update flow works end-to-end against
a real backend. **The first real check must be manual, on a test/pilot
machine**, before rolling out to the whole fleet.

## Configuration

The service reads `%ProgramData%\NetdeskAgent\config.json`. Copy
`Netdesk.Agent.Service\config.example.json` there and fill it in:

```json
{
  "ServerBaseUrl": "https://<netdesk-server>:3000",
  "EnrollToken": "<AGENT_ENROLL_TOKEN from backend .env>",
  "HeartbeatIntervalSeconds": 30,
  "InventoryIntervalSeconds": 3600,
  "JobsPollIntervalSeconds": 15,
  "EventLogIntervalSeconds": 300,
  "DnsLogIntervalSeconds": 300,
  "UpdateCheckIntervalSeconds": 1800,
  "VncLocalPort": 5901
}
```

`VncLocalPort` is the port the local UltraVNC server listens on (see the
"Remote screen control (VNC)" section below). **The default is
deliberately 5901, not the standard VNC port 5900** - on managed machines
5900 is already taken by the existing RealVNC server (an independent
install, outside this system). UltraVNC should be installed/configured to
listen on 5901 (or any other free port - it just has to match this field).

After the first successful registration, the agent permanently stores the
received `agentId`/`apiKey` in `%ProgramData%\NetdeskAgent\state.json` —
`EnrollToken` is no longer used after that and can be removed from the
config when rolling out to other machines.

Other files in `%ProgramData%\NetdeskAgent\`:
- `logs\agent.log` — the NetdeskAgent service's run log
- `logs\manager.log` — the NetdeskAgentManager service's run log (a
  separate file - both services run at the same time, see the "Netdesk
  Agent Manager" section)
- `manager-command.json` — the mailbox file, NetdeskAgent → Manager
  commands (only exists while a command is waiting to be processed)
- `eventlog-bookmarks.json` — the last read event log record ID (so the
  same entries aren't sent again)
- `update-staging\`, `update-backup\` — temporary files during auto-update

## Running for debugging (without installing the service)

```
Netdesk.Agent.Service.exe --console
```

Runs the exact same loop as the real service, just in a console (Ctrl+C to
exit).

## Installing as a real Windows Service

Via `InstallUtil.exe` (part of .NET Framework), from the `Service\` folder.
**The path depends on the target machine's OS bitness** (the assemblies
are MSIL/AnyCPU and run on both, but the `Framework64` folder doesn't
exist on real 32-bit Windows):

```
:: 64-bit Windows
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe

:: 32-bit Windows
%WINDIR%\Microsoft.NET\Framework\v4.0.30319\InstallUtil.exe Netdesk.Agent.Service.exe
```

```
sc start NetdeskAgent
```

The service installs under the `LocalSystem` account, `Automatic` startup
(configured in `ProjectInstaller.cs`). Automatic restart on a service
crash isn't part of InstallUtil — it's configured separately:

```
sc failure NetdeskAgent reset=86400 actions=restart/60000/restart/60000/restart/60000
```

Uninstall: the same `InstallUtil.exe` (64-bit or 32-bit path above) with
`/u Netdesk.Agent.Service.exe`.

**The Manager IS INSTALLED as a real Windows Service** (unlike the old
Updater) — the same InstallUtil procedure as above, just against
`Netdesk.Agent.Manager.exe` in the `Manager\` folder and with the
`NetdeskAgentManager` service name. For rolling out to the whole existing
fleet, the recommended path is the "Install/update NetdeskAgent Manager
service" preset (`frontend/src/constants/powershellPresets.js`) sent as a
`run_powershell_script` job through the existing agents (`pilot` group
first) - it runs the whole InstallUtil/`sc failure` procedure
automatically. The manual steps above remain a fallback for the first
pilot machine.

## Auth model (for reference)

Same as the backend's memory — enrollment goes with
`Authorization: Bearer <EnrollToken>`, everything after that (heartbeat,
inventory, jobs, update) with `Authorization: Bearer <agentId>:<apiKey>`.
See `Netdesk.Agent.Common/Http/NetdeskApiClient.cs`.

## Allowed job commands

`restart_computer`, `shutdown_computer`, `logoff_user`, `restart_service`,
`start_service`, `stop_service` (require `payload.serviceName`),
`start_netdesk_agent`, `stop_netdesk_agent`, `restart_netdesk_agent` (no
payload - the target is always NetdeskAgent), `run_powershell_script`
(requires `payload.script`), `collect_inventory`, `refresh_software_list`,
`delete_temp_files`. Must exactly match the backend's `COMMAND_TYPES`
(`dtos/agentJobs.dto.js`) — see `Netdesk.Agent.Common/Jobs/JobExecutor.cs`.

`start_vnc_bridge` and `force_reinstall_agent` are special cases - created
programmatically by the server/frontend (not manually picked as a command
type), they don't go through `JobExecutor`, and are handled by
`AgentWorker.ProcessJobAsync` directly (`force_reinstall_agent` calls
`UpdateManager.ForceInstallAsync` - see the "Netdesk Agent Manager" section
below).

`start_netdesk_agent`/`stop_netdesk_agent`/`restart_netdesk_agent` are the
main, recommended path for MANUALLY managing the NetdeskAgent service -
they always go through NetdeskAgentManager (the mailbox), never through
`JobExecutor` directly. As defense in depth, the generic
`restart_service`/`start_service`/`stop_service` with
`payload.serviceName = "NetdeskAgent"` (case-insensitive) are also SILENTLY
REDIRECTED to the same path (`AgentWorker.IsNetdeskAgentServiceControl`)
instead of going through `JobExecutor` - the agent must not
(re)start itself synchronously on the same loop that needs to report the
result to the server. For ANY OTHER service name,
`JobExecutor.ControlService` works unchanged.

## Netdesk Agent Manager

A separate, PERMANENT Windows Service (`NetdeskAgentManager`,
`Netdesk.Agent.Manager.exe`) - its only reason to exist is so that
NetdeskAgent.Service.exe never has to (re)start itself or change its own
files while running. A "set and forget" component - it has no auto-update
logic of its own, rollout is manual via the preset (see "Installing as a
real Windows Service" above).

**Communication (NetdeskAgent → Manager):**
1. NetdeskAgent writes a `ManagerCommand` JSON to
   `%ProgramData%\NetdeskAgent\manager-command.json` (an atomic rename via
   a `.tmp` file - the Manager never reads a half-written file). One
   pending command at a time, not a queue (a deliberately accepted
   trade-off for v1 - given the realistic pace of jobs this is low risk).
2. NetdeskAgent calls `new ServiceController("NetdeskAgentManager").
   ExecuteCommand(128)` - a Windows Service custom control code, "wake up
   and check the mailbox" (code 128,
   `ManagerCommandClient.CustomCommandCode`). A failure of this call (e.g.
   the Manager isn't currently running) is NOT fatal - the command is
   already waiting in the file.
3. The Manager's `OnCustomCommand(128)` just signals an event (it has to
   return control to the SCM quickly) - the `ManagerWorker`'s work loop
   processes it. The Manager ALSO independently polls the same file on
   every tick (5s) - a safety net in case the custom command signal was
   lost (e.g. the Manager was down when the command was written).

**Two actions (`ManagerCommand.Action`):**
- `control_service` - `ServiceName`/`ServiceAction` ("start"/"stop"/
  "restart"). `ServiceName` is NOT hardcoded to "NetdeskAgent" - the
  Manager can control any service name (currently only used for
  NetdeskAgent, but the mechanism itself is generic).
- `install_files` - `StagingDir`/`InstallDir`/`BackupDir` (arbitrary paths,
  NOT hardcoded to the Service folder), `ServiceName` (which service to
  stop/start around the copy), and OPTIONALLY `ServerBaseUrl`/`AgentId`/
  `ApiKey`/`FromVersion`/`ToVersion` (only if the sender wants the Manager
  to report the result to the server - see below). The Manager: **first
  explicitly verifies that stopping the service succeeded**
  (`TryControlService`) - if it did NOT, the files aren't touched at all, a
  clear failure with a reason is reported, and it's done. Only if the stop
  succeeded: back up `InstallDir` to `BackupDir` (recursively,
  `DirectorySync` - fixes an old bug where the Updater didn't copy the
  `amd64\`/`x86\` subfolders) → copy `StagingDir` over `InstallDir` → start
  the service. On an error AFTER a successful stop: roll back from the
  backup + restart before reporting failure (the same shape as the old
  Updater). The mechanism is NOT tied to NetdeskAgent specifically - the
  same three paths + service name could in the future install/update ANY
  component at ANY location (e.g. a completely separate folder/service
  outside `C:\Program Files\NetdeskAgent\`), with no change to the Manager
  code. The current (NetdeskAgent) usage doesn't touch `config.json` - it
  lives outside `InstallDir`.

  If `ServerBaseUrl` is filled in, the Manager reports the result (success
  or failure) to the server afterward (`POST /api/agents/update/report`) -
  the ONLY network call the Manager ever makes (which is why it has its
  own outbound firewall rule, for the same reason as NetdeskAgent's). If
  `ServerBaseUrl` is NOT filled in (a future non-agent use), this step is
  silently skipped.

**Forced reinstall** (the `force_reinstall_agent` job, triggered from the
"Force reinstall" button on the `/agent-releases` page) goes through the
same `install_files` path, just WITHOUT the `isNewerVersion` check - it can
"reinstall" even a version the agent already claims to be on (fixing a
corrupted install). The digital signature isn't checked in this case (the
job payload doesn't carry it) - SHA-256 integrity still applies mandatorily.

**Not verified live** (same reason as the rest of the agent): that the
`ServiceController.ExecuteCommand`/`OnCustomCommand` signal actually
arrives between the two processes on a real Windows machine, and that the
whole stop→copy→start cycle doesn't leave the machine in a broken state.
The first check must be on a pilot machine - see `DEPLOYMENT.md`.

## Remote screen control (VNC)

The agent itself doesn't do screen capture or input injection - **UltraVNC**
does (it must be installed and running as a Windows service on every
machine where this feature is used, bound **only to 127.0.0.1**, never
exposed on the network). The agent's role is a thin
`NetdeskAgent.Common.Vnc.VncBridge` - when a `start_vnc_bridge` command
arrives (sent from the server after an admin clicks "Take screen control"
in the UI), the agent opens a TCP connection to
`127.0.0.1:<VncLocalPort>` and a WebSocket connection to the backend
(`/api/agents/vnc-stream?sessionId=N`), then just forwards raw bytes (the
real RFB protocol) in both directions until either side closes the
connection. No GDI, no `SendInput`, no WTS/Session 0 workaround - a plain
loopback TCP connection works identically regardless of which session the
service is running in.

**Installing UltraVNC on the agent machine is outside the scope of this
repo** - it's not part of the automatic build/update process (deliberately,
to avoid adding a third Windows service into the routine, unsupervised
auto-update loop). Download it from uvnc.com, install it as a service
(`winvnc.exe -install`), and configure it to listen only on loopback (a
bind address if available, or a Windows Firewall rule as defense in
depth). If the backend is configured with `VNC_SHARED_PASSWORD`, UltraVNC
needs the same password in `ultravnc.ini`; alternatively, configure
UltraVNC to not require a password for loopback connections (the real
security boundary is the JWT/agent credentials at the WS relay layer, not
the VNC password).

**Port**: the standard VNC port `5900` is already taken on managed
machines by the existing RealVNC server (a separate install, unrelated to
this system) - UltraVNC should be installed/configured on `5901` (the
default in `AgentSettings.VncLocalPort`) to avoid a bind conflict. This is
purely a configuration choice - `VncLocalPort` in `config.json` must match
whatever port UltraVNC is actually configured on, any free port works.

The feature sits behind the `vnc_enabled` app-setting flag (off by
default) - the admin enables it on the `/config` page.

**WebSocket client (Windows 7 note)**: `VncBridge` uses **websocket-sharp**
(the `WebSocketSharp-netstandard` NuGet package), NOT
`System.Net.WebSockets.ClientWebSocket` - discovered live on a real
Windows 7 machine: `ClientWebSocket` throws
`PlatformNotSupportedException` there, because it depends on the WinHTTP
WebSocket API which doesn't exist before Windows 8. websocket-sharp
implements the RFB 6455 protocol itself, over raw sockets, without that OS
dependency - and Windows 7 support is exactly why this project targets
`net452` (see the top of this file), so this was a real blocker, not a
cosmetic difference. Consequence: this library has no public API for
arbitrary custom HTTP headers during the handshake, so the agent sends
`agentId`/`apiKey` as a query string (`?agentId=...&apiKey=...`) instead of
an `Authorization` header - the same pattern the viewer side (the browser)
already had to use for the same reason (the browser's WebSocket API also
doesn't allow custom headers), and the same security note applies (the
route goes through `server.on("upgrade")`, not through Express/morgan, so
it isn't logged to the access log).

## DNS query logging

`NetdeskAgent.Common.DnsLogs.DnsQueryCollector` tracks this machine's DNS
queries via **WinDivert packet capture** (direct P/Invoke over
`WinDivert.dll`, see `WinDivertInterop.cs`). This is the SECOND replacement
for the earlier ETW `Microsoft-Windows-DNS-Client` version:

1. **1.5.5 and earlier**: the ETW `Microsoft-Windows-DNS-Client` provider.
   Proved insufficient live - ETW sees ONLY queries made through the
   Windows OS resolver API; an application (or malware) that opens its own
   UDP socket and sends a raw query to port 53 (exactly the pattern for C2
   beaconing/DNS tunneling) is invisible.
2. **1.5.6**: an attempt with Npcap packet capture. Turned out Npcap's
   silent (`/S`) install mode only exists with the paid "Npcap OEM"
   edition - the free version, despite `/S`, behaved live as if it were
   waiting for interactive confirmation (Session 0, where the service
   runs, has no one to show it to), so the `install-npcap` job on a real
   machine hit the 10-minute JobExecutor timeout. The preset and the
   attempt were fully removed.
3. **1.5.7 (current)**: **WinDivert**. No equivalent problem - the driver
   (`WinDivert64.sys`) installs automatically and SILENTLY on the first
   `WinDivertOpen()` call, with no separate install step/preset needed. It's
   enough for `WinDivert.dll`/`WinDivert64.sys` (version 2.2.2, x64) to just
   SIT next to the `.exe` (see `Netdesk.Agent.Service.csproj`, `<None>`
   entries with `<Link>` - the files physically live in
   `Netdesk.Agent.Service\WinDivert\`, copied straight to the output root).
   **Limitation**: WinDivert officially only supports Windows 10/11/Server,
   NOT Windows 7 - deliberately accepted (Windows 7 machines in the fleet
   remain without DNS packet-capture visibility for this feature,
   `TryStart()` just silently returns `false`, the rest of the agent works
   normally).

Captures ONLY this machine's outbound UDP queries (the WinDivert filter
`"outbound and udp and udp.DstPort == 53"`, `WINDIVERT_FLAG_SNIFF` mode -
a copy of the packet, with no ability/obligation to modify or block the
real traffic) - deliberately not DNS responses (would double-count the
same query) and deliberately not the whole network segment (per-computer
forensics, not a network IDS). IPv6 and TCP DNS (port 53 over TCP - rare in
practice, usually only large/zone-transfer responses) are out of scope for
v1.

Starts ONCE at service startup (not per tick like the other collectors) -
the capture thread has to run continuously so it doesn't miss queries
between sync cycles (a single `WinDivertOpen()` handle covers the machine's
ENTIRE network traffic, unlike Npcap where a capture had to be enumerated
and opened per network device separately). `AgentWorker` periodically
(`DnsLogIntervalSeconds`, 300s by default) takes the accumulated state
(aggregated per domain - query count, first/last seen, not one row per
individual query) and sends it over the same `/api/agents/inventory`
channel as event logs.

**Security purpose**: there's no firewall/NDR solution on the network -
this is the only visibility into DNS-level threats (malware C2 beaconing,
DNS tunneling/exfiltration, phishing domains). The backend stores the
aggregate per (computer, domain) in `computer_dns_queries`, shown at
`/dns-logs` (admin-only, searchable by domain) in the frontend.
Deliberately WITHOUT active alerting against a blocklist in this
iteration - just storage + search for later forensics.

**License**: WinDivert is dual-licensed LGPLv3/GPLv2 - used here as an
unmodified, redistributed binary dependency (the LGPLv3 condition), the
license text travels with the binary files
(`WinDivert\LICENSE-WinDivert.txt`, copied to the output alongside the
DLL/SYS).

**Not verified live** (same reason as the rest of the agent - no
Windows/admin/network environment in the sandbox): that WinDivert capture
actually catches queries in practice on a real machine, and that the DNS
packet parsing (hand-written - IPv4/UDP/DNS offsets in
`DnsQueryCollector.TryExtractQueryName`, simplified compared to the Npcap
version since WinDivert delivers the packet already at the IP level,
without Ethernet/VLAN headers) works correctly on real traffic. The code
compiles cleanly (`dotnet build`), `WinDivert.dll`/`WinDivert64.sys` are
confirmed present in the build output next to the `.exe` (verified live
after a clean rebuild) - but the first real check must be manual, on a
test/pilot machine (ship 1.5.7 to one Windows 10/11 agent, check
`/dns-logs` for domains appearing), before a wider rollout.
