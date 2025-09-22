$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServiceName = "DnsLoggingService"
$TargetPath = "C:\Program Files\DnsLogger\DnsLoggingService.exe"
$NewExe = Join-Path $ScriptDir "DnsLoggingService.exe"

$InstallFolder = Split-Path $TargetPath
if (!(Test-Path $InstallFolder)) {
    Write-Host "Creating install folder: $InstallFolder"
    New-Item -Path $InstallFolder -ItemType Directory -Force
}

if (!(Test-Path $NewExe)) {
    Write-Error "Executable not found: $NewExe"
    exit 1
}

$EnvFile = Join-Path $ScriptDir ".env"
if (Test-Path $EnvFile) {
    Write-Host "Copying .env file to $InstallFolder"
    Copy-Item -Path $EnvFile -Destination $InstallFolder -Force
}
else {
    Write-Warning ".env file not found in script directory."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($null -ne $service) {
    Write-Host "Stopping existing service: $ServiceName"
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue

    $exeName = "DnsLoggingService"
    $maxWait = 10
    $waited = 0
    $proc = Get-Process -Name $exeName -ErrorAction SilentlyContinue

    while ($proc) {
        if ($waited -ge $maxWait) {
            Write-Warning "Process still running after $maxWait seconds. Killing process..."
            try {
                $proc | Stop-Process -Force -ErrorAction Stop
                Write-Host "Process killed."
            }
            catch {
                Write-Error "Failed to kill locked process: $_"
                exit 1
            }
            break
        }
        Write-Host "Waiting for process to exit..."
        Start-Sleep -Seconds 1
        $waited++
        $proc = Get-Process -Name $exeName -ErrorAction SilentlyContinue
    }
}
else {
    Write-Host "Service $ServiceName not found. Creating it..."
    $quotedPath = "`"$TargetPath`""
    sc.exe create $ServiceName binPath= $quotedPath start= auto
    Start-Sleep -Seconds 2
}

Write-Host "Copying new executable to $TargetPath"
Copy-Item -Path $NewExe -Destination $TargetPath -Force

Write-Host "Starting service: $ServiceName"
Start-Service -Name $ServiceName

Write-Host "Update complete."
