// Preset PowerShell skripte za "run_powershell_script" job - popunjavaju
// jobForm.script koji korisnik može slobodno da izmeni pre slanja (tako je
// "custom" opcija besplatna: prazan izbor ili izmena preseta). Namerno samo
// dijagnostika i niskorizično čišćenje - ništa destruktivno (bez format,
// bez brisanja korisničkih fajlova/profila, bez menjanja mrežne/domain
// konfiguracije).
export const POWERSHELL_PRESETS = [
  {
    id: 'flush-dns',
    label: 'Isprazni DNS keš',
    script: 'Clear-DnsClientCache; "DNS keš ispražnjen."',
  },
  {
    id: 'top-folders',
    label: 'Top 10 najvećih foldera na C:',
    script:
      'Get-ChildItem C:\\ -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {\n' +
      '  [PSCustomObject]@{\n' +
      '    Folder = $_.FullName\n' +
      '    SizeGB = [math]::Round((Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1GB, 2)\n' +
      '  }\n' +
      '} | Sort-Object SizeGB -Descending | Select-Object -First 10 | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'clear-temp',
    label: 'Očisti privremene fajlove (Temp)',
    script:
      'Get-ChildItem -Path $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue\n' +
      '"Temp folder očišćen."',
  },
  {
    id: 'restart-spooler',
    label: 'Restartuj Print Spooler servis',
    script: 'Restart-Service -Name Spooler -Force; Get-Service Spooler | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'clear-print-queue',
    label: 'Očisti zaglavljen print red',
    script:
      'Stop-Service Spooler -Force\n' +
      'Remove-Item "$env:SystemRoot\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue\n' +
      'Start-Service Spooler\n' +
      '"Print red očišćen."',
  },
  {
    id: 'recent-system-errors',
    label: 'Poslednjih 20 grešaka iz Event Log-a (System)',
    script:
      'Get-WinEvent -LogName System -MaxEvents 300 -ErrorAction SilentlyContinue |\n' +
      '  Where-Object { $_.LevelDisplayName -eq "Error" } | Select-Object -First 20 TimeCreated, ProviderName, Message |\n' +
      '  Format-List | Out-String',
  },
  {
    id: 'uptime',
    label: 'Prikaži uptime računara',
    script:
      '$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime\n' +
      '$span = (Get-Date) - $boot\n' +
      '"Poslednji restart: $boot`nUptime: $($span.Days)d $($span.Hours)h $($span.Minutes)m"',
  },
  {
    id: 'recent-updates',
    label: 'Poslednjih 10 instaliranih Windows Update-a',
    script:
      'Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID, Description, InstalledOn |\n' +
      '  Format-Table -AutoSize | Out-String',
  },
  {
    id: 'top-cpu',
    label: 'Top 10 procesa po CPU opterećenju',
    script:
      'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, Id, CPU, @{N="RAM_MB";E={[math]::Round($_.WorkingSet/1MB,1)}} |\n' +
      '  Format-Table -AutoSize | Out-String',
  },
  {
    id: 'top-ram',
    label: 'Top 10 procesa po zauzeću RAM-a',
    script:
      'Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 Name, Id, @{N="RAM_MB";E={[math]::Round($_.WorkingSet/1MB,1)}} |\n' +
      '  Format-Table -AutoSize | Out-String',
  },
  {
    id: 'local-admins',
    label: 'Prikaži lokalne administratore',
    script: 'Get-LocalGroupMember -Group "Administrators" | Select-Object Name, PrincipalSource | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'defender-status',
    label: 'Status Windows Defender-a',
    script:
      'Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated |\n' +
      '  Format-List | Out-String',
  },
  {
    id: 'firewall-status',
    label: 'Status Windows Firewall-a (svi profili)',
    script: 'Get-NetFirewallProfile | Select-Object Name, Enabled | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'network-config',
    label: 'Prikaži mrežnu konfiguraciju (IP/DNS/Gateway)',
    script:
      'Get-NetIPConfiguration | Format-List InterfaceAlias, IPv4Address, IPv4DefaultGateway, DNSServer | Out-String',
  },
  {
    id: 'restart-explorer',
    label: 'Restartuj Windows Explorer (ako je zaglavljen)',
    script: 'Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2; Start-Process explorer.exe; "Explorer restartovan."',
  },
  {
    id: 'empty-recycle-bin',
    label: 'Isprazni Recycle Bin',
    script: 'Clear-RecycleBin -Force -ErrorAction SilentlyContinue; "Recycle Bin ispražnjen."',
  },
  {
    id: 'disk-space',
    label: 'Slobodan prostor na svim diskovima',
    script:
      'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" |\n' +
      '  Select-Object DeviceID, @{N="SizeGB";E={[math]::Round($_.Size/1GB,1)}}, @{N="FreeGB";E={[math]::Round($_.FreeSpace/1GB,1)}} |\n' +
      '  Format-Table -AutoSize | Out-String',
  },
  {
    id: 'installed-printers',
    label: 'Prikaži instalirane štampače',
    script: 'Get-Printer | Select-Object Name, DriverName, PortName, Shared | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'stopped-auto-services',
    label: 'Servisi koji su "Automatic" a nisu pokrenuti',
    script:
      'Get-Service | Where-Object { $_.StartType -eq "Automatic" -and $_.Status -ne "Running" } |\n' +
      '  Select-Object Name, DisplayName, Status | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'connectivity-test',
    label: 'Testiraj internet konekciju (ping + DNS)',
    script:
      'Test-Connection -ComputerName 8.8.8.8 -Count 4 | Format-Table -AutoSize | Out-String\n' +
      'Resolve-DnsName google.com | Format-Table -AutoSize | Out-String',
  },
]
