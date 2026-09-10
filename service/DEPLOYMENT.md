# Installing the Netdesk Agent on a target computer

A practical step-by-step guide to installing it on one managed computer.
For architecture, project structure and digital signing see `README.md`.

## 0. Prerequisite (once, on the build machine)

Visual Studio 2019+ with the ".NET Framework 4.5.2 targeting pack" (Visual
Studio Installer → Modify → Individual Components, if missing).

## 1. Build (Release configuration)

In Visual Studio:

1. Open `Netdesk.Agent.sln`.
2. Solution Configuration (toolbar) → **Release** (not Debug).
3. Build → **Rebuild Solution**.

Or via the command line:

```
dotnet build -c Release
```

The first build requires internet access (NuGet restore for
Newtonsoft.Json).

## 2. Collect the files to copy

**From `Netdesk.Agent.Service\bin\Release\net452\`:**

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

**From `Netdesk.Agent.Manager\bin\Release\net452\`:**

```
Netdesk.Agent.Manager.exe
Netdesk.Agent.Manager.exe.config
Newtonsoft.Json.dll
```

(The Manager does NOT reference `Netdesk.Agent.Common` or
`websocket-sharp` - see README.md, the "Netdesk Agent Manager" section:
the Manager has its own FileLogger/Paths/ManagerCommand/DirectorySync,
deliberately separate so an Agent update can never break the Manager and
vice versa.

`WinDivert.dll`/`WinDivert64.sys`/`LICENSE-WinDivert.txt` are ONLY in the
Service folder (the Manager doesn't do DNS logging) - since version 1.5.7,
DNS query logging uses WinDivert packet capture (see README.md's "DNS
query logging" section for the full ETW→Npcap→WinDivert migration
history). Unlike Npcap, WinDivert does NOT require a separate install
step/preset - the driver installs itself, silently, on the first call from
the agent, it's enough for these two files to just sit next to the `.exe`
(already configured in the `.csproj` to be copied automatically at build
time). IMPORTANT LIMITATION: WinDivert only works on Windows 10/11/Server -
on Windows 7 machines DNS logging stays disabled (`TryStart()` silently
returns false), the rest of the agent works normally.

The `Microsoft.Diagnostics.Tracing.TraceEvent` package (ETW-based DNS
logging up to version 1.5.5, and its 6 transitive DLLs +
`amd64\`/`x86\`/`arm64\` native helper subfolders) has been completely
REMOVED.)

The `.pdb` files and `config.example.json` don't get carried to the target
machine (just debug symbols / a template).

## 3. Copy to the target machine into the exact layout

```
C:\Program Files\NetdeskAgent\
├── Service\    ← files from Service bin/Release
└── Manager\    ← files from Manager bin/Release
```

**Important:** `Service\` and `Manager\` must be separate, sibling
folders. The auto-update package later only overwrites the contents of
`Service\` — `Manager\` must stay untouched (the Manager can't overwrite
its own files while running). For installing on an EXISTING fleet (not the
first pilot machine), skip the manual copy/InstallUtil steps below for the
Manager - use instead the "Install/update NetdeskAgent Manager service"
preset sent as a `run_powershell_script` job (see `README.md`, the
"Netdesk Agent Manager" section).

## 4. Check prerequisites on the target machine

- .NET Framework 4.5.2+ (Windows 10 already has it; on Windows 7 SP1 check
  it's installed).
- The organization's root CA (mkcert) already in the trusted root store —
  should be valid for all managed computers.
- Network access to `https://<netdesk-server>:3000`.

## 5. Create config.json on the target machine

Create the folder `%ProgramData%\NetdeskAgent\` and inside it,
`config.json`:

```json
{
  "ServerBaseUrl": "https://<netdesk-server>:3000",
  "EnrollToken": "<AGENT_ENROLL_TOKEN from backend .env>",
  "HeartbeatIntervalSeconds": 30,
  "InventoryIntervalSeconds": 3600,
  "JobsPollIntervalSeconds": 15,
  "EventLogIntervalSeconds": 300,
  "DnsLogIntervalSeconds": 300,
  "UpdateCheckIntervalSeconds": 1800
}
```

After the first successful registration the agent permanently stores
`agentId`/`apiKey` in `%ProgramData%\NetdeskAgent\state.json` —
`EnrollToken` is no longer used after that and can be dropped from the
config when rolling out to other machines.

## 6. Install the service (CMD/PowerShell as Administrator)

**Important - the `InstallUtil.exe` path depends on the target machine's
OS bitness** (not the agent's bitness - the assemblies are MSIL/AnyCPU and
run on both, but `InstallUtil.exe` itself exists in two separate installs
that Windows sets up depending on its own bitness - the `Framework64`
folder does NOT EXIST on real 32-bit Windows):

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

Then, in both cases:
```
sc start NetdeskAgent
sc failure NetdeskAgent reset=86400 actions=restart/60000/restart/60000/restart/60000
```

The service installs under the `LocalSystem` account, `Automatic`
startup. The last command (`sc failure`) sets up automatic restart on a
service crash — `InstallUtil` doesn't do that on its own.

**Same procedure, separately, for the Manager** (only on the FIRST pilot
machine - for the rest of the fleet use the preset from step 3 above):

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

Then:
```
sc start NetdeskAgentManager
sc failure NetdeskAgentManager reset=86400 actions=restart/60000/restart/60000/restart/60000
```

## 7. Verify it worked

- `services.msc` → both "NetdeskAgent" AND "NetdeskAgent Manager" should
  be **Running**.
- `%ProgramData%\NetdeskAgent\logs\agent.log` → should show a successful
  enroll and regular heartbeat entries.
- `%ProgramData%\NetdeskAgent\logs\manager.log` → should show "Netdesk
  Agent Manager starting...".
- The admin UI (`/agents` on the frontend) → a new agent with that
  machine's hostname should appear.

## Uninstalling

```
cd "C:\Program Files\NetdeskAgent\Service"
sc stop NetdeskAgent
```

Then the same `InstallUtil.exe` (64-bit or 32-bit path, see step 6) with
`/u`:
```
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe /u Netdesk.Agent.Service.exe
```

Same for the Manager (a different folder/exe, same pattern):
```
cd "C:\Program Files\NetdeskAgent\Manager"
sc stop NetdeskAgentManager
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\InstallUtil.exe /u Netdesk.Agent.Manager.exe
```

Then manually delete `C:\Program Files\NetdeskAgent\` and
`%ProgramData%\NetdeskAgent\` for a full cleanup, and (optionally) revoke
the agent in the admin UI.

## Note before a wider rollout

The `InstallUtil.exe` step itself (installing as a real Windows Service,
as opposed to `--console` debug mode) hasn't been verified live on any
machine so far. Additionally, NEW for the Manager: the signaling path
itself (`ServiceController.ExecuteCommand` → `OnCustomCommand`, code 128)
between the NetdeskAgent and NetdeskAgentManager processes also hasn't
been verified live - this is exactly the part that solves the original
problem (an IPS/EDR on the network path used to kill the older "detached
hidden shell" restart attempt), so it's the most valuable thing to check
live on a pilot machine. Recommended order: install both services → send
a "Restart service" job with `serviceName=NetdeskAgent` from the admin
UI → confirm in `manager.log`/`agent.log` and the admin UI (the agent goes
offline then comes back online) → test a real update end-to-end → only
then a wider rollout (`deployment_group='pilot'` exists in the database
exactly for this step).

**For 1.5.7 (WinDivert DNS logging)**: a completely new, live-unverified
capture path (see README.md's "DNS query logging" section for the full
ETW→Npcap→WinDivert migration history - the Npcap attempt in 1.5.6 was
abandoned because its silent install mode is only available with the paid
"Npcap OEM" edition). There's NO separate install step/preset this time -
`WinDivert.dll`/`WinDivert64.sys` travel INSIDE the release package (part
of the Service folder), the driver installs itself on the first call.
Order on the pilot machine: send a `force_reinstall_agent`/normal update
to 1.5.7 (**a Windows 10/11 machine - WinDivert doesn't support
Windows 7**) → generate a bit of DNS traffic on that machine (e.g. open a
few sites) → check `/dns-logs` in the frontend for domains appearing for
that agent → check `agent.log` for a "WinDivert DNS capture started" line
(confirming `TryStart()` didn't silently bail).
