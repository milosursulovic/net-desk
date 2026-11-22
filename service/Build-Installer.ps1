<#
.SYNOPSIS
    Builds NetdeskAgentSetup.exe - a single-file installer for the Netdesk
    Agent (Service) + NetdeskAgentManager, for Windows 7 SP1+ (.NET 4.5.2+).

.DESCRIPTION
    1. dotnet build -c Release of Netdesk.Agent.sln (Service + Manager).
    2. Stages Service\, Manager\, rootCA.pem and the two config templates
       (ServerBaseUrl is filled in on the target machine: the Windows 7 URL
       on Windows 7, the normal one everywhere else).
    3. Zips the staging folder and embeds it into Netdesk.Agent.Installer.
    4. Puts NetdeskAgentSetup.exe + Install.cmd into the package folder
       (default "agent-deploy\Paket") next to the prerequisites (.NET 4.8,
       WMF 5.1 .msu) - copy that folder to a machine and run Install.cmd.

    Secrets (enroll tokens) and site-specific values come from a local,
    untracked JSON file (default: "agent-deploy\deploy.local.json") - they
    never end up in git. If the file is missing, a template is created.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File service\Build-Installer.ps1
#>

[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$OutputDir
)

$ErrorActionPreference = "Stop"

# Defaults set here, not in param(): Windows PowerShell 5.1 leaves $PSScriptRoot
# empty while evaluating param() defaults.
if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot "..\agent-deploy\deploy.local.json" }
if (-not $OutputDir) { $OutputDir = Join-Path $PSScriptRoot "..\agent-deploy\Paket" }

function Write-Utf8NoBom([string]$Path, [string]$Text) {
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
}

function Get-VersionConstant([string]$File) {
    $m = Select-String -Path $File -Pattern 'Current\s*=\s*"([^"]+)"' | Select-Object -First 1
    if (-not $m) { throw "Version constant not found in $File" }
    return $m.Matches[0].Groups[1].Value
}

function Copy-BuildOutput([string]$Source, [string]$Dest) {
    if (-not (Test-Path $Source)) { throw "Build output not found: $Source" }
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    Get-ChildItem -Path $Source -Recurse -File |
        Where-Object { $_.Extension -ne ".pdb" -and $_.Name -ne "config.example.json" } |
        ForEach-Object {
            $relative = $_.FullName.Substring((Resolve-Path $Source).Path.Length).TrimStart("\")
            $target = Join-Path $Dest $relative
            New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
            Copy-Item $_.FullName $target -Force
        }
}

# ---------- local config ----------

if (-not (Test-Path $ConfigPath)) {
    $template = [ordered]@{
        ServerUrl          = "https://10.230.62.81:3000"
        ServerUrlWin7      = "https://netdesk.local:3000"
        HostsLineWin7      = "10.230.62.81 netdesk.local"
        AgentEnrollToken   = "<AGENT_ENROLL_TOKEN from the production backend .env>"
        ManagerEnrollToken = "<MANAGER_ENROLL_TOKEN from the production backend .env>"
        RootCaPath         = "rootCA.pem"
        AgentSettings      = [ordered]@{
            HeartbeatIntervalSeconds      = 30
            InventoryIntervalSeconds      = 3600
            JobsPollIntervalSeconds       = 15
            EventLogIntervalSeconds       = 300
            DnsLogIntervalSeconds         = 300
            UpdateCheckIntervalSeconds    = 1800
            VncLocalPort                  = 5901
            ProcessMonitorIntervalSeconds = 15
            KillWatchedProcesses          = $false
        }
    }
    New-Item -ItemType Directory -Path (Split-Path $ConfigPath) -Force | Out-Null
    Write-Utf8NoBom $ConfigPath ($template | ConvertTo-Json -Depth 5)
    throw "Created a template at '$ConfigPath' - fill in the tokens (and check the URLs), then run again."
}

$configDir = Split-Path (Resolve-Path $ConfigPath).Path
$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json

foreach ($name in "ServerUrl", "ServerUrlWin7", "AgentEnrollToken", "ManagerEnrollToken") {
    $value = $cfg.$name
    if (-not $value -or $value.StartsWith("<")) { throw "'$name' is not set in $ConfigPath" }
}

# ---------- build ----------

Write-Host "Building Netdesk.Agent.sln (Release)..."
& dotnet build (Join-Path $PSScriptRoot "Netdesk.Agent.sln") -c Release --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed ($LASTEXITCODE)" }

$installerProject = Join-Path $PSScriptRoot "Netdesk.Agent.Installer\Netdesk.Agent.Installer.csproj"
$staging = Join-Path $PSScriptRoot "Netdesk.Agent.Installer\obj\payload"
$payloadZip = Join-Path $PSScriptRoot "Netdesk.Agent.Installer\obj\payload.zip"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Copy-BuildOutput (Join-Path $PSScriptRoot "Netdesk.Agent.Service\bin\Release\net452") (Join-Path $staging "Service")
Copy-BuildOutput (Join-Path $PSScriptRoot "Netdesk.Agent.Manager\bin\Release\net452") (Join-Path $staging "Manager")

if ($cfg.RootCaPath) {
    $rootCa = if ([System.IO.Path]::IsPathRooted($cfg.RootCaPath)) { $cfg.RootCaPath } else { Join-Path $configDir $cfg.RootCaPath }
    if (-not (Test-Path $rootCa)) { throw "Root CA not found: $rootCa" }
    Copy-Item $rootCa (Join-Path $staging "rootCA.pem")
}
else {
    Write-Warning "RootCaPath not set - the installer won't import a root CA."
}

# ServerBaseUrl stays a placeholder - the installer picks the URL by OS on the target.
$agentConfig = [ordered]@{ ServerBaseUrl = "{{SERVER_BASE_URL}}"; EnrollToken = $cfg.AgentEnrollToken }
if ($cfg.AgentSettings) {
    foreach ($p in $cfg.AgentSettings.PSObject.Properties) { $agentConfig[$p.Name] = $p.Value }
}
Write-Utf8NoBom (Join-Path $staging "agent-config.json") ($agentConfig | ConvertTo-Json -Depth 5)

$managerConfig = [ordered]@{ ServerBaseUrl = "{{SERVER_BASE_URL}}"; EnrollToken = $cfg.ManagerEnrollToken }
Write-Utf8NoBom (Join-Path $staging "manager-config.json") ($managerConfig | ConvertTo-Json)

$agentVersion = Get-VersionConstant (Join-Path $PSScriptRoot "Netdesk.Agent.Common\AgentVersionInfo.cs")
$managerVersion = Get-VersionConstant (Join-Path $PSScriptRoot "Netdesk.Agent.Manager\ManagerVersionInfo.cs")

$ini = @(
    "ServerUrl=$($cfg.ServerUrl)"
    "ServerUrlWin7=$($cfg.ServerUrlWin7)"
    "HostsLineWin7=$($cfg.HostsLineWin7)"
    "AgentVersion=$agentVersion"
    "ManagerVersion=$managerVersion"
) -join "`r`n"
Write-Utf8NoBom (Join-Path $staging "setup.ini") $ini

# Entry names may come out with '\' separators depending on the .NET version -
# the installer normalizes them on extraction.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $payloadZip)

Write-Host "Building NetdeskAgentSetup.exe..."
& dotnet build $installerProject -c Release --nologo -v q --no-incremental "-p:PayloadZip=$payloadZip"
if ($LASTEXITCODE -ne 0) { throw "Installer build failed ($LASTEXITCODE)" }

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$exe = Join-Path $PSScriptRoot "Netdesk.Agent.Installer\bin\Release\net452\NetdeskAgentSetup.exe"
$outExe = Join-Path $OutputDir "NetdeskAgentSetup.exe"
Copy-Item $exe $outExe -Force
Copy-Item (Join-Path $PSScriptRoot "Install.cmd") $OutputDir -Force

# The staged payload and the installer's build output contain the enroll tokens -
# don't leave them lying around (the only copy is the exe in the package folder).
foreach ($dir in "bin", "obj") {
    Remove-Item (Join-Path $PSScriptRoot "Netdesk.Agent.Installer\$dir") -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------- prerequisites (.NET 4.8 + WMF 5.1) ----------
# Kept in the package folder between builds. Missing ones are taken from downloads
# dropped next to deploy.local.json (NDP48-x86-x64-AllOS-ENU.exe and the two
# *KB3191566*.zip files - the .msu is unpacked, cmd.exe on Windows 7 can't unzip).
$netName = "NDP48-x86-x64-AllOS-ENU.exe"
$msuNames = "Win7AndW2K8R2-KB3191566-x64.msu", "Win7-KB3191566-x86.msu"

if (-not (Test-Path (Join-Path $OutputDir $netName))) {
    $dl = Get-ChildItem $configDir -Filter "NDP48-x86-x64-AllOS-*.exe" | Select-Object -First 1
    if ($dl) { Copy-Item $dl.FullName (Join-Path $OutputDir $netName) }
}
foreach ($z in Get-ChildItem $configDir -Filter "*KB3191566*.zip") {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($z.FullName)
    try {
        foreach ($entry in $archive.Entries | Where-Object { $_.Name -like "*.msu" }) {
            $target = Join-Path $OutputDir $entry.Name
            if (-not (Test-Path $target)) {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target)
            }
        }
    }
    finally { $archive.Dispose() }
}

$missing = @(@($netName) + $msuNames | Where-Object { -not (Test-Path (Join-Path $OutputDir $_)) })

$sizeMb = [math]::Round((Get-Item $outExe).Length / 1MB, 1)
Write-Host ""
Write-Host "Done: $((Resolve-Path $OutputDir).Path) - setup $sizeMb MB, agent $agentVersion, manager $managerVersion"
if ($missing.Count -gt 0) {
    Write-Warning ("Missing prerequisites (Install.cmd will fail on machines that need them): " + ($missing -join ", "))
}
else {
    Write-Host "Copy the whole folder to the machine and run Install.cmd."
}
