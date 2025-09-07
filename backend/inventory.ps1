<# 
  Hardware Inventory + JWT POST (Windows, PowerShell 5.1)
  - Prikuplja: OS, CPU, RAM (po modulu), Storage, GPU, BIOS, Motherboard, NIC
  - Snima lokalno JSON/CSV (opciono)
  - Login -> JWT -> POST na /api/protected/ip-addresses/:ip/metadata
#>

param(
    [string]$AuthUrl = "https://10.230.62.81:3000/api/auth/login",
    [string]$ApiBase = "https://10.230.62.81:3000/api/protected/ip-addresses",
    [string]$Username = "admin",
    [string]$Password = "password",
    [string]$Ip = $null,  # ako nije dato, autodetekcija privatnog IPv4
    [string]$OutputDir = "$env:ProgramData\HW_Inventory",
    [switch]$WriteFiles,         # ako dodaš -WriteFiles, snimi JSON/CSV lokalno
    [switch]$TrustAllCerts       # za self-signed TLS na localhostu
)

# ===== Helpers =====
Function Try-Get { param([scriptblock]$Code) try { & $Code } catch { $null } }

function Get-MyIPv4 {
    try {
        $ips = Get-WmiObject Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } |
        ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d{1,3}(\.\d{1,3}){3}$' }
        if (-not $ips) { return $null }
        $private = $ips | Where-Object {
            ($_ -like '10.*') -or ($_ -like '192.168.*') -or ($_ -like '172.16.*') -or ($_ -like '172.17.*') -or ($_ -like '172.18.*') -or ($_ -like '172.19.*') -or ($_ -like '172.2?.*') -or ($_ -like '172.3?.*')
        }
        if ($private) { return $private[0] }
        return $ips[0]
    }
    catch { return $null }
}

function Get-MediaType {
    # HDD/SSD/NVMe best-effort
    param($wmiDrive, $physDisk)
    if ($physDisk) {
        if ($physDisk.MediaType) { return [string]$physDisk.MediaType }
        if ($physDisk.BusType) { return [string]$physDisk.BusType }
    }
    if ($wmiDrive.MediaType) { return $wmiDrive.MediaType }
    if ($wmiDrive.Model -match 'NVMe') { return 'NVMe SSD' }
    if ($wmiDrive.Model -match 'SSD') { return 'SSD' }
    return 'HDD or Unknown'
}

# Self-signed TLS workaround (PS 5.1 nema -SkipCertificateCheck)
if ($TrustAllCerts) {
    try {
        @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint a, X509Certificate b, WebRequest c, int d) { return true; }
}
"@ | Add-Type
        [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
    }
    catch { }
}

# ===== Kolekcija podataka =====
$computer = $env:COMPUTERNAME
$now = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

$os = Try-Get { Get-CimInstance Win32_OperatingSystem }
$cs = Try-Get { Get-CimInstance Win32_ComputerSystem }
$bd = Try-Get { Get-CimInstance Win32_BaseBoard }
$bios = Try-Get { Get-CimInstance Win32_BIOS }
$cpu = Try-Get { Get-CimInstance Win32_Processor }
$mem = Try-Get { Get-CimInstance Win32_PhysicalMemory }
$dd = Try-Get { Get-CimInstance Win32_DiskDrive }
$gpus = Try-Get { Get-CimInstance Win32_VideoController }
$nics = Try-Get { Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.PhysicalAdapter -eq $true -and $_.NetEnabled -eq $true } }

$physDisks = @()
$gp = Try-Get { Get-Command Get-PhysicalDisk -ErrorAction SilentlyContinue }
if ($gp) {
    $pd = Try-Get { Get-PhysicalDisk }
    if ($pd) { $physDisks = $pd }
}

# RAM modules
$ramList = @()
$totalRamBytes = 0
foreach ($m in ($mem | Where-Object { $_ })) {
    $cap = [int64]$m.Capacity
    $totalRamBytes += $cap
    $ff = $m.FormFactor
    if ($ff -eq 8) { $ff = 'DIMM' } elseif ($ff -eq 12) { $ff = 'SODIMM' }
    $ramList += [pscustomobject]@{
        Slot         = $m.DeviceLocator
        Manufacturer = $m.Manufacturer
        PartNumber   = ($m.PartNumber -replace '\s+$', '')
        Serial       = $m.SerialNumber
        CapacityGB   = [math]::Round($cap / 1GB, 2)
        SpeedMTps    = $m.Speed
        FormFactor   = $ff
    }
}

# Storage
$storageList = @()
foreach ($d in ($dd | Where-Object { $_ })) {
    $pdMatch = $null
    if ($physDisks -and $d.Model) {
        $pdMatch = $physDisks | Where-Object { $_.FriendlyName -and $_.FriendlyName -like "*$($d.Model)*" } | Select-Object -First 1
        if (-not $pdMatch -and $d.SerialNumber) {
            $pdMatch = $physDisks | Where-Object { $_.SerialNumber -and $_.SerialNumber -eq $d.SerialNumber } | Select-Object -First 1
        }
    }
    $mediaType = Get-MediaType -wmiDrive $d -physDisk $pdMatch
    $busType = if ($pdMatch -and $pdMatch.BusType) { $pdMatch.BusType } else { $d.InterfaceType }
    $sizeGB = if ($d.Size) { [math]::Round([int64]$d.Size / 1GB, 2) } else { $null }

    $storageList += [pscustomobject]@{
        Model     = $d.Model
        Serial    = $d.SerialNumber
        Firmware  = $d.FirmwareRevision
        SizeGB    = $sizeGB
        MediaType = $mediaType
        BusType   = $busType
        DeviceID  = $d.DeviceID
    }
}

# GPUs
$gpuList = @()
foreach ($g in ($gpus | Where-Object { $_ })) {
    $vramGB = if ($g.AdapterRAM) { [math]::Round([int64]$g.AdapterRAM / 1GB, 2) } else { $null }
    $gpuList += [pscustomobject]@{
        Name       = $g.Name
        DriverVers = $g.DriverVersion
        VRAM_GB    = $vramGB
    }
}

# NICs
$nicList = @()
foreach ($n in ($nics | Where-Object { $_ })) {
    $speedMbps = if ($n.Speed) { [math]::Round([double]$n.Speed / 1MB, 0) } else { $null }
    $nicList += [pscustomobject]@{
        Name      = $n.Name
        MAC       = $n.MACAddress
        SpeedMbps = $speedMbps
    }
}

# Inventar objekat
$inventory = [pscustomobject]@{
    CollectedAt  = (Get-Date).ToString("s")
    ComputerName = $computer
    UserName     = $env:USERNAME
    OS           = [pscustomobject]@{
        Caption     = $os.Caption
        Version     = $os.Version
        Build       = $os.BuildNumber
        InstallDate = $os.InstallDate
    }
    System       = [pscustomobject]@{
        Manufacturer = $cs.Manufacturer
        Model        = $cs.Model
        TotalRAM_GB  = [math]::Round(($totalRamBytes / 1GB), 2)
    }
    Motherboard  = [pscustomobject]@{
        Manufacturer = $bd.Manufacturer
        Product      = $bd.Product
        Serial       = $bd.SerialNumber
    }
    BIOS         = [pscustomobject]@{
        Vendor      = $bios.Manufacturer
        Version     = ($bios.SMBIOSBIOSVersion -join ' ')
        ReleaseDate = $bios.ReleaseDate
    }
    CPU          = [pscustomobject]@{
        Name        = $cpu.Name
        Cores       = $cpu.NumberOfCores
        LogicalCPUs = $cpu.NumberOfLogicalProcessors
        MaxClockMHz = $cpu.MaxClockSpeed
        Socket      = $cpu.SocketDesignation
    }
    RAMModules   = $ramList
    Storage      = $storageList
    GPUs         = $gpuList
    NICs         = $nicList
    PSU          = "Unknown (not programmatically detectable on standard Windows PCs)"
}

# ===== Lokalno snimanje (opciono) =====
if ($WriteFiles) {
    New-Item -ItemType Directory -Path $OutputDir -ErrorAction SilentlyContinue | Out-Null
    $jsonPath = Join-Path $OutputDir "$computer-$now.json"
    $inventory | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 $jsonPath

    $diskSummary = ($inventory.Storage | ForEach-Object { "$($_.Model) $($_.SizeGB)GB $($_.MediaType)" })
    $gpuSummary = ($inventory.GPUs    | ForEach-Object { $_.Name })
    $csvRow = [pscustomobject]@{
        CollectedAt  = $inventory.CollectedAt
        ComputerName = $inventory.ComputerName
        UserName     = $inventory.UserName
        OS           = $inventory.OS.Caption
        OSVersion    = $inventory.OS.Version
        Model        = $inventory.System.Model
        Manufacturer = $inventory.System.Manufacturer
        TotalRAM_GB  = $inventory.System.TotalRAM_GB
        CPU          = $inventory.CPU.Name
        MB_Product   = $inventory.Motherboard.Product
        MB_Mfr       = $inventory.Motherboard.Manufacturer
        DiskSummary  = ' | ' -join $diskSummary
        GPU_Summary  = ' | ' -join $gpuSummary
        PSU          = $inventory.PSU
    }
    $csvPath = Join-Path $OutputDir "$computer-$now.csv"
    $csvRow | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvPath

    Write-Host "Inventar snimljen:"
    Write-Host "  JSON: $jsonPath"
    Write-Host "  CSV : $csvPath"
}

# ===== IP cilj =====
$targetIp = if ($Ip) { $Ip } else { Get-MyIPv4 }
if (-not $targetIp) { throw "Nije pronađen cilj IP (ni parametar -Ip ni autodetekcija)." }

# ===== AUTH + POST =====
try {
    $loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json
    $loginResp = Invoke-RestMethod -Method Post -Uri $AuthUrl -ContentType 'application/json' -Body $loginBody
    if (-not $loginResp.token) { throw "Login nije vratio token." }
    $jwt = $loginResp.token

    $headers = @{ Authorization = "Bearer $jwt" }
    $targetUrl = "$ApiBase/$targetIp/metadata"

    Invoke-RestMethod -Method Post -Uri $targetUrl -Headers $headers `
        -Body ($inventory | ConvertTo-Json -Depth 6) -ContentType 'application/json' | Out-Null

    Write-Host "POST sa JWT uspešan -> $targetUrl"
}
catch {
    Write-Warning "Slanje nije uspelo: $($_.Exception.Message)"
    if ($WriteFiles) {
        $errPath = Join-Path $OutputDir "post_errors.log"
        "[$(Get-Date -Format s)] $($_.Exception.Message)" | Out-File -Append -FilePath $errPath -Encoding UTF8
        Write-Host "Greška zabeležena: $errPath"
    }
}
