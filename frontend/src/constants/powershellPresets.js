// Preset PowerShell skripte za "run_powershell_script" job - popunjavaju
// jobForm.script koji korisnik može slobodno da izmeni pre slanja (tako je
// "custom" opcija besplatna: prazan izbor ili izmena preseta). Namerno samo
// dijagnostika i niskorizično čišćenje - ništa destruktivno (bez format,
// bez brisanja korisničkih fajlova/profila, bez menjanja mrežne/domain
// konfiguracije).
export const POWERSHELL_PRESETS = [
  {
    id: 'test-script',
    label: '🧪 Test skripta (provera da agent izvršava komande)',
    script: '"Test OK - $env:COMPUTERNAME - $(Get-Date)"',
  },
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
  {
    id: 'read-agent-log-full',
    label: 'Pročitaj ceo sadržaj agent.log',
    // File.ReadAllText (ne Get-Content) namerno - agent.log piše FileLogger.cs
    // preko File.AppendAllText bez eksplicitnog encoding-a, što je UTF-8 BEZ
    // BOM-a po .NET default-u. Get-Content u Windows PowerShell 5.1 pravilno
    // čita i UTF-8-bez-BOM-a, ali File.ReadAllText(path, Encoding.UTF8) je
    // eksplicitan i ne zavisi od auto-detekcije.
    script:
      '$logPath = "$env:ProgramData\\NetdeskAgent\\logs\\agent.log"\n' +
      'if (Test-Path $logPath) {\n' +
      '  [System.IO.File]::ReadAllText($logPath, [System.Text.Encoding]::UTF8)\n' +
      '} else {\n' +
      '  "agent.log nije pronadjen na $logPath"\n' +
      '}',
  },
  {
    id: 'read-agent-log-tail',
    label: 'Pročitaj poslednjih 100 linija agent.log',
    // Get-Content -Tail (ne File.ReadAllText) namerno - agent.log na
    // produkciji vremenom naraste, a ReadAllText bi morao da učita ceo fajl
    // u memoriju samo da bi se na kraju uzelo poslednjih par linija.
    // -Tail čita fajl unazad i zaustavlja se čim skupi traženi broj linija.
    // -Encoding UTF8 eksplicitan iz istog razloga kao u punom read presetu
    // (agent.log je UTF-8 bez BOM-a).
    script:
      '$logPath = "$env:ProgramData\\NetdeskAgent\\logs\\agent.log"\n' +
      'if (Test-Path $logPath) {\n' +
      '  Get-Content -Path $logPath -Tail 100 -Encoding UTF8 | Out-String\n' +
      '} else {\n' +
      '  "agent.log nije pronadjen na $logPath"\n' +
      '}',
  },
  {
    id: 'read-agent-config',
    label: 'Pročitaj sadržaj config.json',
    // Isti razlog kao agent.log presetima iznad - File.ReadAllText sa
    // eksplicitnim UTF8 (bez BOM-a), ne Get-Content, da se ne oslanja na
    // auto-detekciju encoding-a (update-agent-config-key preset ispod piše
    // config.json na isti način).
    script:
      '$configPath = "$env:ProgramData\\NetdeskAgent\\config.json"\n' +
      'if (Test-Path $configPath) {\n' +
      '  [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)\n' +
      '} else {\n' +
      '  "config.json nije pronadjen na $configPath"\n' +
      '}',
  },
  {
    id: 'update-agent-config-key',
    label: 'Upiši key/value u config.json',
    // Generička skripta, NE hardkodovana na jedan konkretan ključ - $key/
    // $value na vrhu su namerno ono što se menja pre slanja (npr. za neko
    // buduće novo AgentSettings.cs polje), ostatak skripte se ne dira.
    // Namerno BEZ restarta servisa - to se radi posebno (drugom skriptom/
    // preset-om), ne ovde.
    //
    // VAŽNO - tip vrednosti zavisi od toga da li je $value pod navodnicima:
    //   $value = 300        -> upisuje se kao BROJ u JSON (300)
    //   $value = "300"      -> upisuje se kao STRING u JSON ("300")
    //   $value = $true      -> upisuje se kao BOOLEAN u JSON (true)
    // Poklopi ovo sa stvarnim tipom polja u AgentSettings.cs (npr. `int
    // DnsLogIntervalSeconds` očekuje broj, ne string pod navodnicima).
    //
    // Add-Member -Force namerno - radi i ako ključ već postoji u config.json
    // (prepiše ga) i ako ne postoji (doda ga bez greške - bez -Force,
    // Add-Member baca "Member already exists" ako ključ VEĆ postoji).
    //
    // File.ReadAllText/WriteAllText sa eksplicitnim UTF8 (bez BOM-a na
    // upisu) - isti razlog kao agent.log preset: eksplicitno, ne oslanja se
    // na auto-detekciju encoding-a.
    script:
      '# --- Izmeni ova dva reda pre slanja ---\n' +
      '$key = "DnsLogIntervalSeconds"\n' +
      '$value = 300\n' +
      '# ---------------------------------------\n' +
      '\n' +
      '$configPath = "$env:ProgramData\\NetdeskAgent\\config.json"\n' +
      'if (-not (Test-Path $configPath)) {\n' +
      '  "config.json nije pronadjen na $configPath"\n' +
      '} else {\n' +
      '  $raw = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)\n' +
      '  $config = $raw | ConvertFrom-Json\n' +
      '  $config | Add-Member -NotePropertyName $key -NotePropertyValue $value -Force\n' +
      '  $json = $config | ConvertTo-Json -Depth 5\n' +
      '  [System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))\n' +
      '\n' +
      '  "config.json azuriran ($key=$value). Restart servisa nije izvrsen - uradi ga posebno."\n' +
      '}',
  },
  {
    id: 'restart-netdesk-agent-deferred',
    label: 'Restartuj NetdeskAgent servis (odloženo, bezbedno)',
    // Restartovanje servisa iz JOBA KOJI TAJ ISTI SERVIS IZVRŠAVA ne sme da
    // ide preko obične ServiceController.Restart logike (restart_service
    // komanda) - agent bi ubio sam sebe pre nego što stigne da prijavi
    // rezultat serveru, pa bi job ostao zauvek zaglavljen na "sent". Umesto
    // toga, Start-Process (bez -Wait) samo pokrene odvojen, "siroče" cmd.exe
    // proces i odmah se vrati - ovaj PowerShell proces (koji job čeka) se
    // završi za par milisekundi, job se prijavi kao uspešan, a stvarni
    // net stop/net start se desi tek 5 sekundi kasnije, potpuno nezavisno
    // od agent procesa koji ga je pokrenuo.
    script:
      'Start-Process -FilePath "cmd.exe" `\n' +
      '  -ArgumentList \'/c "timeout /t 5 /nobreak >nul & net stop NetdeskAgent & net start NetdeskAgent"\' `\n' +
      '  -WindowStyle Hidden',
  },
]
