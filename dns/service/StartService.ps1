# --- CONFIG ---
$ProjectPath = "E:\Projects\dns-logger\service\DnsLoggingService"
$ServiceName = "DnsLoggingService"
$PublishFolder = "$ProjectPath\bin\Release\net8.0\win-x64\publish"
$TargetPath = "C:\Program Files\DnsLogger\DnsLoggingService.exe"

# --- STEP 1: Publish new version ---
Write-Host "Publishing .NET app..."
dotnet publish "$ProjectPath" -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true

# --- STEP 2: Ensure install folder exists ---
$InstallFolder = Split-Path $TargetPath
if (!(Test-Path $InstallFolder)) {
    Write-Host "Creating install folder: $InstallFolder"
    New-Item -Path $InstallFolder -ItemType Directory -Force
}

# --- STEP 3: Copy new EXE after stopping the service ---
$NewExe = Join-Path $PublishFolder "DnsLoggingService.exe"

if (!(Test-Path $NewExe)) {
    Write-Error "Published executable not found: $NewExe"
    exit 1
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($null -ne $service) {
    Write-Host "Stopping existing service: $ServiceName"
    Stop-Service -Name $ServiceName -Force

    # Wait for process to exit completely
    $exeName = [System.IO.Path]::GetFileName($TargetPath)
    $maxWait = 10
    $waited = 0
    while (Get-Process | Where-Object { $_.Path -eq $TargetPath } -ErrorAction SilentlyContinue) {
        if ($waited -ge $maxWait) {
            Write-Error "Service process still running after $maxWait seconds. Aborting."
            exit 1
        }
        Write-Host "Waiting for process to exit..."
        Start-Sleep -Seconds 1
        $waited++
    }
} else {
    Write-Host "Service $ServiceName not found. Creating it..."
    $quotedPath = "`"$TargetPath`""
    sc.exe create $ServiceName binPath= $quotedPath start= auto
    Start-Sleep -Seconds 2
}

Write-Host "Copying new executable to $TargetPath"
Copy-Item -Path $NewExe -Destination $TargetPath -Force

# --- STEP 4: Start or restart service ---
Write-Host "Starting service: $ServiceName"
Start-Service -Name $ServiceName

Write-Host "Update complete."