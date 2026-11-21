// Preset PowerShell scripts for the "run_powershell_script" job - they fill
// jobForm.script, which the user can freely edit before sending (so the
// "custom" option comes for free: an empty choice or an edited preset). Deliberately only
// diagnostics and low-risk cleanup - nothing destructive (no format,
// no deleting user files/profiles, no changing network/domain
// configuration).
export const POWERSHELL_PRESETS = [
  {
    id: 'test-script',
    label: '🧪 Test skripta (provera da agent izvršava komande)',
    script: '"Test OK - $env:COMPUTERNAME - $(Get-Date)"',
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
    id: 'uptime',
    label: 'Prikaži uptime računara',
    script:
      '$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime\n' +
      '$span = (Get-Date) - $boot\n' +
      '"Poslednji restart: $boot`nUptime: $($span.Days)d $($span.Hours)h $($span.Minutes)m"',
  },
  {
    id: 'local-admins',
    label: 'Prikaži lokalne administratore',
    script: 'Get-LocalGroupMember -Group "Administrators" | Select-Object Name, PrincipalSource | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'disable-browser-secure-dns',
    label: 'Isključi Secure DNS (DoH) u Chrome/Edge/Brave/Firefox',
    // No #requires -RunAsAdministrator (the original version of the script
    // had it) - that's a parse-time check OUTSIDE the try/catch, so a potential
    // failure of that check would bypass the script's own error handling and surface
    // as a raw PowerShell error instead of a clean "ERROR: ..." message. The agent
    // runs run_powershell_script jobs under the LocalSystem account
    // (JobExecutor.cs), which already has full rights over HKLM regardless of that
    // check - it would add risk without any real extra protection in this
    // context (dispatch is already admin-only at the application level itself).
    // The registry paths/values are the real, documented enterprise
    // policies of each browser (the Chromium trio shares the DnsOverHttpsMode schema,
    // Firefox has its own DNSOverHTTPS/Enabled+Locked schema) - browsers
    // must be restarted for the change to actually take effect.
    script:
      '$ErrorActionPreference = "Stop"\n' +
      '\n' +
      '$results = New-Object System.Collections.Generic.List[string]\n' +
      '\n' +
      'function Set-RegistryPolicy {\n' +
      '    param(\n' +
      '        [Parameter(Mandatory = $true)]\n' +
      '        [string]$Path,\n' +
      '\n' +
      '        [Parameter(Mandatory = $true)]\n' +
      '        [string]$Name,\n' +
      '\n' +
      '        [Parameter(Mandatory = $true)]\n' +
      '        $Value,\n' +
      '\n' +
      '        [Parameter(Mandatory = $true)]\n' +
      '        [ValidateSet("String", "DWord")]\n' +
      '        [string]$Type\n' +
      '    )\n' +
      '\n' +
      '    if (-not (Test-Path $Path)) {\n' +
      '        New-Item -Path $Path -Force | Out-Null\n' +
      '    }\n' +
      '\n' +
      '    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force | Out-Null\n' +
      '}\n' +
      '\n' +
      'try {\n' +
      '    $chromePath = "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome"\n' +
      '    Set-RegistryPolicy -Path $chromePath -Name "DnsOverHttpsMode" -Value "off" -Type String\n' +
      '    $results.Add("Chrome: Secure DNS isključen")\n' +
      '\n' +
      '    $edgePath = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge"\n' +
      '    Set-RegistryPolicy -Path $edgePath -Name "DnsOverHttpsMode" -Value "off" -Type String\n' +
      '    $results.Add("Edge: Secure DNS isključen")\n' +
      '\n' +
      '    $bravePath = "HKLM:\\SOFTWARE\\Policies\\BraveSoftware\\Brave"\n' +
      '    Set-RegistryPolicy -Path $bravePath -Name "DnsOverHttpsMode" -Value "off" -Type String\n' +
      '    $results.Add("Brave: Secure DNS isključen")\n' +
      '\n' +
      '    $firefoxPath = "HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox\\DNSOverHTTPS"\n' +
      '    Set-RegistryPolicy -Path $firefoxPath -Name "Enabled" -Value 0 -Type DWord\n' +
      '    Set-RegistryPolicy -Path $firefoxPath -Name "Locked" -Value 1 -Type DWord\n' +
      '    $results.Add("Firefox: DNS over HTTPS isključen i zaključan")\n' +
      '\n' +
      '    $summary = $results -join "; "\n' +
      '    Write-Output "SUCCESS: $summary"\n' +
      '    Write-Output "Browseri moraju biti restartovani da bi politike sigurno bile primenjene."\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "ERROR: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'network-config',
    label: 'Prikaži mrežnu konfiguraciju (IP/DNS/Gateway)',
    script:
      'Get-NetIPConfiguration | Format-List InterfaceAlias, IPv4Address, IPv4DefaultGateway, DNSServer | Out-String',
  },
  {
    id: 'installed-printers',
    label: 'Prikaži instalirane štampače',
    script: 'Get-Printer | Select-Object Name, DriverName, PortName, Shared | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'ram-modules',
    label: 'Prikaži RAM module (kapacitet, tip, brzina)',
    // No diacritics in the PS string/output itself (the same limitation as the other
    // presets here) - JobExecutor.cs writes the script via File.WriteAllText WITHOUT
    // an explicit encoding (the BOM-less UTF-8 .NET default), and Windows
    // PowerShell 5.1 reads a BOM-less .ps1 using the system ANSI code page, not
    // UTF-8 - diacritics (č/ć/đ/š/ž) would turn into garbage in the output.
    //
    // $rezultati = foreach (...) {...} (not a bare foreach that implicitly
    // writes to the pipeline) + an explicit Format-Table -AutoSize | Out-String
    // at the end - the same pattern as the other listing presets here (e.g.
    // installed-printers above), for consistent, readable job output.
    script:
      '$ramModuli = Get-CimInstance -ClassName Win32_PhysicalMemory\n' +
      '\n' +
      '$rezultati = foreach ($modul in $ramModuli) {\n' +
      '    $velicinaGB = [math]::Round($modul.Capacity / 1GB, 0)\n' +
      '\n' +
      '    # [int] cast pretvara $null (SMBIOSMemoryType nedostupan na starijim\n' +
      '    # sistemima) u 0, isto kao izricito poredjenje sa 0 - pa jedan\n' +
      '    # -eq 0 uslov pokriva i "nedostupno" i "zaista 0".\n' +
      '    $kodTipa = [int]$modul.SMBIOSMemoryType\n' +
      '    if ($kodTipa -eq 0) { $kodTipa = [int]$modul.MemoryType }\n' +
      '\n' +
      '    $ddrTip = switch ($kodTipa) {\n' +
      '        20 { "DDR" }\n' +
      '        21 { "DDR2" }\n' +
      '        24 { "DDR3" }\n' +
      '        26 { "DDR4" }\n' +
      '        27 { "DDR5" }\n' +
      '        34 { "DDR5" }\n' +
      '        Default { "Nepoznato ($kodTipa)" }\n' +
      '    }\n' +
      '\n' +
      '    [PSCustomObject]@{\n' +
      '        "Slot/Pozicija" = $modul.DeviceLocator\n' +
      '        "Kapacitet"     = "$velicinaGB GB"\n' +
      '        "Tip Memorije"  = $ddrTip\n' +
      '        "Brzina (MHz)"  = $modul.Speed\n' +
      '        "Proizvodjac"   = $modul.Manufacturer\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      '$rezultati | Format-Table -AutoSize | Out-String',
  },
  {
    id: 'read-agent-log-full',
    label: 'Pročitaj ceo sadržaj agent.log',
    // File.ReadAllText (not Get-Content) on purpose - agent.log is written by FileLogger.cs
    // via File.AppendAllText without an explicit encoding, which is UTF-8 WITHOUT
    // a BOM by the .NET default. Get-Content in Windows PowerShell 5.1 correctly
    // reads UTF-8-without-BOM too, but File.ReadAllText(path, Encoding.UTF8) is
    // explicit and doesn't depend on auto-detection.
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
    // Get-Content -Tail (not File.ReadAllText) on purpose - agent.log in
    // production grows over time, and ReadAllText would have to load the whole file
    // into memory just to take the last few lines at the end.
    // -Tail reads the file backwards and stops as soon as it has collected the requested number of lines.
    // -Encoding UTF8 is explicit for the same reason as in the full read preset
    // (agent.log is UTF-8 without a BOM).
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
    // Same reason as the agent.log presets above - File.ReadAllText with
    // explicit UTF8 (no BOM), not Get-Content, so it doesn't rely on
    // encoding auto-detection (the update-agent-config-key preset below writes
    // config.json the same way).
    script:
      '$configPath = "$env:ProgramData\\NetdeskAgent\\config.json"\n' +
      'if (Test-Path $configPath) {\n' +
      '  [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)\n' +
      '} else {\n' +
      '  "config.json nije pronadjen na $configPath"\n' +
      '}',
  },
  {
    id: 'list-agent-service-folder',
    label: 'Prikaži sadržaj foldera NetdeskAgent\\Service',
    // Diagnostics of the actually installed state on the target machine (files,
    // sizes, modification dates) - without needing RDP/AnyDesk access,
    // useful for comparing against the DEPLOYMENT.md list of expected files
    // (e.g. whether the new version really arrived after an auto-update, or
    // whether some DLL is missing). -Recurse because the amd64\/x86\ subfolders (TraceEvent
    // native helpers) also live inside Service\.
    script:
      '$path = "C:\\Program Files\\NetdeskAgent\\Service"\n' +
      'if (Test-Path $path) {\n' +
      '  Get-ChildItem -Path $path -Recurse -Force |\n' +
      '    Select-Object FullName, Length, LastWriteTime |\n' +
      '    Format-Table -AutoSize | Out-String\n' +
      '} else {\n' +
      '  "Folder nije pronadjen na $path"\n' +
      '}',
  },
  {
    id: 'update-agent-config-key',
    label: 'Upiši key/value u config.json',
    // A generic script, NOT hardcoded to one specific key - $key/
    // $value at the top are deliberately what gets changed before sending (e.g. for some
    // future new AgentSettings.cs field), the rest of the script stays untouched.
    // Deliberately WITHOUT a service restart - that's done separately (with another script/
    // preset), not here.
    //
    // IMPORTANT - the value type depends on whether $value is quoted:
    //   $value = 300        -> written as a NUMBER in the JSON (300)
    //   $value = "300"      -> written as a STRING in the JSON ("300")
    //   $value = $true      -> written as a BOOLEAN in the JSON (true)
    // Match this to the actual field type in AgentSettings.cs (e.g. `int
    // DnsLogIntervalSeconds` expects a number, not a quoted string).
    //
    // Add-Member -Force on purpose - works both if the key already exists in config.json
    // (overwrites it) and if it doesn't (adds it without an error - without -Force,
    // Add-Member throws "Member already exists" if the key ALREADY exists).
    //
    // File.ReadAllText/WriteAllText with explicit UTF8 (no BOM on
    // write) - same reason as the agent.log preset: explicit, doesn't rely
    // on encoding auto-detection.
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
    id: 'update-agent-config-keys',
    label: 'Upiši više key/value parova u config.json',
    // Same as update-agent-config-key above, just for SEVERAL keys
    // at once - the $updates hashtable at the top is what gets changed before sending
    // (add/remove pairs as needed), the rest of the script stays untouched.
    //
    // IMPORTANT - the value type in the hashtable determines the JSON type the same way as in
    // the single-key preset above:
    //   300        -> written as a NUMBER in the JSON
    //   "300"      -> written as a STRING in the JSON
    //   $true      -> written as a BOOLEAN in the JSON
    // Match each value to the actual type of that field in AgentSettings.cs.
    //
    // Add-Member -Force per key (the same logic as the single-key preset,
    // repeated for each pair in the loop) - works both if the key already exists
    // (overwrites it) and if it doesn't (adds it without an error).
    script:
      '# --- Izmeni hashtable ispod pre slanja (dodaj/ukloni koliko treba parova) ---\n' +
      '$updates = @{\n' +
      '  DnsLogIntervalSeconds    = 300\n' +
      '  InventoryIntervalSeconds = 3600\n' +
      '}\n' +
      '# -------------------------------------------------------------------------\n' +
      '\n' +
      '$configPath = "$env:ProgramData\\NetdeskAgent\\config.json"\n' +
      'if (-not (Test-Path $configPath)) {\n' +
      '  "config.json nije pronadjen na $configPath"\n' +
      '} else {\n' +
      '  $raw = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)\n' +
      '  $config = $raw | ConvertFrom-Json\n' +
      '  foreach ($pair in $updates.GetEnumerator()) {\n' +
      '    $config | Add-Member -NotePropertyName $pair.Key -NotePropertyValue $pair.Value -Force\n' +
      '  }\n' +
      '  $json = $config | ConvertTo-Json -Depth 5\n' +
      '  [System.IO.File]::WriteAllText($configPath, $json, (New-Object System.Text.UTF8Encoding($false)))\n' +
      '\n' +
      '  $summary = ($updates.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ", "\n' +
      '  "config.json azuriran ($summary). Restart servisa nije izvrsen - uradi ga posebno."\n' +
      '}',
  },
  {
    id: 'uninstall-program',
    label: '⚠️ Deinstaliraj program (po nazivu)',
    // Destructive and hard to reverse (requires reinstalling) - check
    // $appName and test on ONE agent before a batch send.
    //
    // Searches by DisplayName (part of the name is enough) through both uninstall
    // registry nodes (64-bit and 32-bit-on-64-bit/"WOW6432Node") - HKCU is
    // deliberately not searched, the agent runs as LocalSystem in Session 0 without
    // a loaded user hive, so per-user installed programs
    // (rare, but they exist) wouldn't be visible/removable from here anyway.
    //
    // Uninstall method priority:
    //   1) QuietUninstallString if the installer publishes one itself - most reliable
    //   2) MSI (UninstallString contains MsiExec.exe) - rebuilt into a
    //      fully silent msiexec /x {GUID} /quiet /norestart call
    //   3) An unknown EXE uninstaller without a silent variant - run as is,
    //      NOT guaranteed to be silent (may ask for a click) - check by hand afterwards.
    script:
      '# --- Izmeni ovaj red pre slanja (deo imena programa je dovoljan) ---\n' +
      '$appName = "Ime programa"\n' +
      '# ----------------------------------------------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '$results = New-Object System.Collections.Generic.List[string]\n' +
      '\n' +
      '$uninstallRoots = @(\n' +
      '    "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",\n' +
      '    "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"\n' +
      ')\n' +
      '\n' +
      '$apps = Get-ItemProperty -Path $uninstallRoots -ErrorAction SilentlyContinue |\n' +
      '    Where-Object { $_.DisplayName -like "*$appName*" }\n' +
      '\n' +
      'if (-not $apps) {\n' +
      '    "Nije pronadjen nijedan instaliran program koji sadrzi \'$appName\' u nazivu."\n' +
      '    exit 0\n' +
      '}\n' +
      '\n' +
      'foreach ($app in $apps) {\n' +
      '    $name = $app.DisplayName\n' +
      '    try {\n' +
      '        if ($app.QuietUninstallString) {\n' +
      '            cmd.exe /c $app.QuietUninstallString | Out-Null\n' +
      '            $results.Add(("{0}: deinstaliran (tiha komanda instalera)" -f $name))\n' +
      '        }\n' +
      '        elseif ($app.UninstallString -match "MsiExec\\.exe") {\n' +
      '            $guid = [regex]::Match($app.UninstallString, "\\{[0-9A-Fa-f\\-]+\\}").Value\n' +
      '            Start-Process "msiexec.exe" -ArgumentList "/x $guid /quiet /norestart" -Wait\n' +
      '            $results.Add(("{0}: deinstaliran (MSI, tiho)" -f $name))\n' +
      '        }\n' +
      '        elseif ($app.UninstallString) {\n' +
      '            cmd.exe /c $app.UninstallString | Out-Null\n' +
      '            $results.Add(("{0}: pokrenut deinstaler (nije garantovano tiho, proveri rucno)" -f $name))\n' +
      '        }\n' +
      '        else {\n' +
      '            $results.Add(("{0}: nema UninstallString, preskoceno" -f $name))\n' +
      '        }\n' +
      '    }\n' +
      '    catch {\n' +
      '        $results.Add(("{0}: GRESKA - {1}" -f $name, $_.Exception.Message))\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      'Write-Output ($results -join "`n")',
  },
  {
    id: 'delete-service',
    label: '⚠️ Obriši Windows servis (po nazivu)',
    // Destructive and irreversible (requires reinstalling the software that
    // registered it) - check $serviceName and test on ONE agent
    // before a batch send. Stops the service first if it's running (sc.exe delete on
    // a running service only marks it "pending deletion" until it
    // stops and all handles are closed, so a clean stop-then-delete is
    // more reliable).
    //
    // sc.exe delete (not the Remove-Service cmdlet) on purpose - Remove-Service
    // only exists since PowerShell 6+, and the agent also targets older Windows/
    // PowerShell versions (5.1 and below, including Windows 7).
    script:
      '# --- Izmeni ovaj red pre slanja ---\n' +
      '$serviceName = "Naziv servisa"\n' +
      '# -----------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '\n' +
      '$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue\n' +
      'if (-not $svc) {\n' +
      '    "Servis \'$serviceName\' ne postoji na ovoj masini."\n' +
      '    exit 0\n' +
      '}\n' +
      '\n' +
      'try {\n' +
      '    if ($svc.Status -ne "Stopped") {\n' +
      '        Stop-Service -Name $serviceName -Force -ErrorAction Stop\n' +
      '    }\n' +
      '\n' +
      '    $out = sc.exe delete $serviceName\n' +
      '    if ($LASTEXITCODE -eq 0) {\n' +
      '        "Servis \'$serviceName\' obrisan."\n' +
      '    } else {\n' +
      '        Write-Output "GRESKA pri brisanju servisa \'$serviceName\': $out"\n' +
      '        exit 1\n' +
      '    }\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'delete-driver',
    label: '⚠️ Obriši drajver uređaja (po nazivu)',
    // Destructive and hard to reverse (hard to restore without the original install
    // package) - check $driverName and test on ONE agent before a
    // batch send.
    //
    // Searches by DeviceName (part of the name is enough) through Win32_PnPSignedDriver
    // (the same WMI source DriverCollector.cs on the agent uses for the PDSU
    // "Drajveri" (drivers) tab), takes InfName (e.g. "oem12.inf") and deletes it via
    // pnputil - also uninstalls the device itself (/uninstall), not just the driver
    // package from the store.
    //
    // pnputil /delete-driver ... /uninstall /force is Windows 10 1607+
    // syntax - on Windows 7/8 pnputil has a different, more limited set of
    // options (no /uninstall), so this preset won't work properly there.
    script:
      '# --- Izmeni ovaj red pre slanja (deo naziva uredjaja je dovoljan) ---\n' +
      '$driverName = "Naziv uredjaja/drajvera"\n' +
      '# ----------------------------------------------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '$results = New-Object System.Collections.Generic.List[string]\n' +
      '\n' +
      '$drivers = Get-CimInstance -ClassName Win32_PnPSignedDriver -ErrorAction SilentlyContinue |\n' +
      '    Where-Object { $_.DeviceName -like "*$driverName*" -and $_.InfName }\n' +
      '\n' +
      'if (-not $drivers) {\n' +
      '    "Nije pronadjen nijedan drajver koji sadrzi \'$driverName\' u nazivu uredjaja."\n' +
      '    exit 0\n' +
      '}\n' +
      '\n' +
      'foreach ($drv in ($drivers | Sort-Object InfName -Unique)) {\n' +
      '    $device = $drv.DeviceName\n' +
      '    $inf = $drv.InfName\n' +
      '    try {\n' +
      '        $out = pnputil.exe /delete-driver $inf /uninstall /force\n' +
      '        if ($LASTEXITCODE -eq 0) {\n' +
      '            $results.Add(("{0} ({1}): drajver obrisan" -f $device, $inf))\n' +
      '        } else {\n' +
      '            $results.Add(("{0} ({1}): GRESKA - {2}" -f $device, $inf, ($out -join " ")))\n' +
      '        }\n' +
      '    }\n' +
      '    catch {\n' +
      '        $results.Add(("{0} ({1}): GRESKA - {2}" -f $device, $inf, $_.Exception.Message))\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      'Write-Output ($results -join "`n")',
  },
  {
    id: 'deploy-trusted-root-cert',
    label: 'Preuzmi i instaliraj CA sertifikat (Trusted Root)',
    // Downloads the certificate from the server (put the .pem into backend/uploads/downloads/ -
    // that route is deliberately without auth, the same mechanism as for the UltraVNC
    // deployment zips, see routes/index.js) and imports it into the Local Machine
    // "Trusted Root Certification Authorities" store - the agent runs as
    // LocalSystem, so certutil -addstore without -user targets exactly that store
    // (confirmed live).
    //
    // Intended primarily for distributing a new mkcert CA root to the fleet IN ADVANCE,
    // BEFORE the server-side certificate is rotated - this
    // avoids a "chicken-and-egg" period when the agent doesn't trust the new
    // certificate because its CA was never imported (a scenario discovered live).
    //
    // TLS 1.2 is explicitly forced for THIS PowerShell process - it's a
    // separate .NET runtime from the agent service itself (the agent sets this only
    // for itself in NetdeskApiClient.cs), so without this the same Windows 7 problem
    // (the TLS handshake fails) also hits the download inside this script.
    //
    // Windows 7 machines in the fleet go through netdesk.local (a hosts entry), while
    // Windows 10/11 go directly via IP - the certificate currently covers both
    // (the SAN has both a DNS Name and an IP Address), but the script still picks the URL by OS
    // version to follow the same pattern the agents are actually configured with.
    // Win32_OperatingSystem.Version for Windows 7 is "6.1.*" (Vista is 6.0,
    // Windows 8/8.1 are 6.2/6.3, Windows 10 and 11 are both "10.0.*").
    script:
      '# --- Izmeni ova dva reda pre slanja ako se promene ---\n' +
      '$certUrlWin7 = "https://netdesk.local:3000/uploads/downloads/rootCA.pem"\n' +
      '$certUrlModern = "https://10.230.62.81:3000/uploads/downloads/rootCA.pem"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$storeName = "Root"\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$certUrl = if ($isWin7) { $certUrlWin7 } else { $certUrlModern }\n' +
      '\n' +
      '$destPath = Join-Path $env:TEMP "netdesk-deploy-cert.pem"\n' +
      '\n' +
      'try {\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($certUrl, $destPath)\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA pri preuzimanju sertifikata (URL: $certUrl): $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}\n' +
      '\n' +
      '$out = certutil.exe -addstore -f $storeName $destPath\n' +
      '$exitCode = $LASTEXITCODE\n' +
      'Remove-Item $destPath -Force -ErrorAction SilentlyContinue\n' +
      '\n' +
      '"Koriscen URL: $certUrl"\n' +
      'Write-Output ($out -join "`n")\n' +
      '\n' +
      'if ($exitCode -ne 0) {\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'deploy-intermediate-cert',
    label: 'Preuzmi i instaliraj CA sertifikat (Intermediate CA)',
    // Same as 'deploy-trusted-root-cert', it just targets the Local Machine
    // "Intermediate Certification Authorities" store (certutil name "CA")
    // instead of "Trusted Root Certification Authorities" - see that preset for
    // the full explanation of the TLS 1.2 forcing and the OS-dependent URL.
    script:
      '# --- Izmeni ova dva reda pre slanja ako se promene ---\n' +
      '$certUrlWin7 = "https://netdesk.local:3000/uploads/downloads/rootCA.pem"\n' +
      '$certUrlModern = "https://10.230.62.81:3000/uploads/downloads/rootCA.pem"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$storeName = "CA"\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$certUrl = if ($isWin7) { $certUrlWin7 } else { $certUrlModern }\n' +
      '\n' +
      '$destPath = Join-Path $env:TEMP "netdesk-deploy-cert.pem"\n' +
      '\n' +
      'try {\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($certUrl, $destPath)\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA pri preuzimanju sertifikata (URL: $certUrl): $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}\n' +
      '\n' +
      '$out = certutil.exe -addstore -f $storeName $destPath\n' +
      '$exitCode = $LASTEXITCODE\n' +
      'Remove-Item $destPath -Force -ErrorAction SilentlyContinue\n' +
      '\n' +
      '"Koriscen URL: $certUrl"\n' +
      'Write-Output ($out -join "`n")\n' +
      '\n' +
      'if ($exitCode -ne 0) {\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'check-trusted-root-cert',
    label: 'Proveri instaliran CA sertifikat (Trusted Root)',
    // Read-only diagnostics, the counterpart of the deploy-trusted-root-cert preset -
    // instead of a loose search by name (it could hit some OLD
    // mkcert CA and falsely report "installed" even though it's the wrong one), it downloads
    // the CURRENT reference certificate from the server (the same /uploads/downloads/rootCA.pem
    // and the same OS-dependent URL/TLS1.2 as the deploy preset) and compares it against the Local
    // Machine "Trusted Root Certification Authorities" store (the Cert:
    // provider) EXACTLY by Thumbprint.
    script:
      '# --- Izmeni ova dva reda pre slanja ako se promene ---\n' +
      '$certUrlWin7 = "https://netdesk.local:3000/uploads/downloads/rootCA.pem"\n' +
      '$certUrlModern = "https://10.230.62.81:3000/uploads/downloads/rootCA.pem"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$certUrl = if ($isWin7) { $certUrlWin7 } else { $certUrlModern }\n' +
      '\n' +
      '$destPath = Join-Path $env:TEMP "netdesk-check-cert.pem"\n' +
      '\n' +
      'try {\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($certUrl, $destPath)\n' +
      '    $refCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($destPath)\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA pri preuzimanju referentnog sertifikata (URL: $certUrl): $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}\n' +
      'finally {\n' +
      '    Remove-Item $destPath -Force -ErrorAction SilentlyContinue\n' +
      '}\n' +
      '\n' +
      '"Referentni CA sa servera (URL: $certUrl):"\n' +
      '"  Subject: $($refCert.Subject)"\n' +
      '"  Thumbprint: $($refCert.Thumbprint)"\n' +
      '""\n' +
      '\n' +
      '$installed = Get-ChildItem -Path "Cert:\\LocalMachine\\Root" | Where-Object { $_.Thumbprint -eq $refCert.Thumbprint }\n' +
      '\n' +
      'if ($installed) {\n' +
      '    "REZULTAT: Trenutni CA JESTE instaliran u Trusted Root store-u."\n' +
      '} else {\n' +
      '    "REZULTAT: Trenutni CA NIJE instaliran u Trusted Root store-u."\n' +
      '    ""\n' +
      '    "Ostali sertifikati u store-u koji lice na mkcert (za poredjenje):"\n' +
      '    Get-ChildItem -Path "Cert:\\LocalMachine\\Root" |\n' +
      '        Where-Object { $_.Subject -like "*mkcert*" -or $_.Issuer -like "*mkcert*" } |\n' +
      '        ForEach-Object { "  $($_.Subject) | Thumbprint: $($_.Thumbprint)" }\n' +
      '}',
  },
  {
    id: 'check-intermediate-cert',
    label: 'Proveri instaliran CA sertifikat (Intermediate CA)',
    // Same as 'check-trusted-root-cert', it just targets the Local Machine
    // "Intermediate Certification Authorities" store (Cert:\LocalMachine\CA).
    script:
      '# --- Izmeni ova dva reda pre slanja ako se promene ---\n' +
      '$certUrlWin7 = "https://netdesk.local:3000/uploads/downloads/rootCA.pem"\n' +
      '$certUrlModern = "https://10.230.62.81:3000/uploads/downloads/rootCA.pem"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$certUrl = if ($isWin7) { $certUrlWin7 } else { $certUrlModern }\n' +
      '\n' +
      '$destPath = Join-Path $env:TEMP "netdesk-check-cert.pem"\n' +
      '\n' +
      'try {\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($certUrl, $destPath)\n' +
      '    $refCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($destPath)\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA pri preuzimanju referentnog sertifikata (URL: $certUrl): $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}\n' +
      'finally {\n' +
      '    Remove-Item $destPath -Force -ErrorAction SilentlyContinue\n' +
      '}\n' +
      '\n' +
      '"Referentni CA sa servera (URL: $certUrl):"\n' +
      '"  Subject: $($refCert.Subject)"\n' +
      '"  Thumbprint: $($refCert.Thumbprint)"\n' +
      '""\n' +
      '\n' +
      '$installed = Get-ChildItem -Path "Cert:\\LocalMachine\\CA" | Where-Object { $_.Thumbprint -eq $refCert.Thumbprint }\n' +
      '\n' +
      'if ($installed) {\n' +
      '    "REZULTAT: Trenutni CA JESTE instaliran u Intermediate CA store-u."\n' +
      '} else {\n' +
      '    "REZULTAT: Trenutni CA NIJE instaliran u Intermediate CA store-u."\n' +
      '    ""\n' +
      '    "Ostali sertifikati u store-u koji lice na mkcert (za poredjenje):"\n' +
      '    Get-ChildItem -Path "Cert:\\LocalMachine\\CA" |\n' +
      '        Where-Object { $_.Subject -like "*mkcert*" -or $_.Issuer -like "*mkcert*" } |\n' +
      '        ForEach-Object { "  $($_.Subject) | Thumbprint: $($_.Thumbprint)" }\n' +
      '}',
  },
  {
    id: 'allow-cross-subnet-icmp',
    label: 'Dozvoli ping sa druge podmreže (cross-site ICMP)',
    // Cause discovered live: the built-in "File and Printer Sharing (Echo
    // Request - ICMPv4-In)" rule for the Private/Domain profiles has its scope
    // (RemoteAddress) limited to LocalSubnet - a server at another site/
    // subnet (e.g. Bolnica 10.230.62.x -> Dom zdravlja agent 10.160.64.x)
    // never matches, even though the rule shows "Enabled: True".
    // There's also a "restrictive" variant with scope Any, but it's enabled by default
    // ONLY for the Public profile - which is why switching the network to Public
    // "fixes" ping, while staying on Private (the more correct, safer
    // choice for an internal network) doesn't work.
    //
    // Deliberately netsh advfirewall instead of the Get/Set-NetFirewallRule cmdlets:
    // 1) The NetSecurity module (which provides those cmdlets) only exists since Windows 8/
    //    Server 2012 - on Windows 7 the preset would silently fail. netsh advfirewall
    //    works identically from Windows 7 to 11.
    // 2) Built-in rules have a LOCALIZED DisplayName (e.g. "Deljenje
    //    datoteka i štampača..." in Serbian, "File and Printer Sharing..."
    //    in English) - trying to find/enable an EXISTING rule by
    //    name would be fragile on a mixed fleet. Instead, this script
    //    adds its OWN, completely new rule with a fixed (non-localized)
    //    name - with no dependency on the system language or the exact name of
    //    existing rules.
    //
    // Deleting and then re-adding at the start makes the script safe to
    // send again (it doesn't pile up duplicate copies of the same rule).
    script:
      '$ErrorActionPreference = "Stop"\n' +
      '$RuleName = "NetDesk - Allow ICMPv4 Echo Request (cross-subnet)"\n' +
      '\n' +
      'try {\n' +
      '    netsh advfirewall firewall delete rule name="$RuleName" | Out-Null\n' +
      '\n' +
      '    $out = netsh advfirewall firewall add rule name="$RuleName" dir=in action=allow protocol=icmpv4:8,any profile=any remoteip=any\n' +
      '    if ($LASTEXITCODE -ne 0) {\n' +
      '        throw "netsh je vratio exit kod $LASTEXITCODE - $($out -join \' \')"\n' +
      '    }\n' +
      '\n' +
      '    Write-Output "Dodato pravilo \'$RuleName\' - ICMPv4 Echo Request dozvoljen sa bilo koje adrese, sva tri profila (Private/Domain/Public)."\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'create-hidden-admin-account',
    label: '⚠️ Kreiraj skriveni admin nalog (RemoteAdmin)',
    // Creates a local admin account and hides it from the sign-in screen (by writing to
    // Winlogon\SpecialAccounts\UserList) - the account still works normally for
    // RDP/net use/etc, it just isn't offered as an option on the login screen.
    // Idempotent - if the user already exists, creation is simply skipped
    // (the "hide" step is still applied, harmless if it's already hidden).
    //
    // Deliberately net.exe (net user/net localgroup) instead of the New-LocalUser/
    // Get-LocalUser cmdlets - the latter come from the LocalAccounts module,
    // which only exists since Windows 10/Server 2016, so the preset would silently fail on the
    // Windows 7 part of the fleet. net.exe works identically on all versions.
    //
    // Note: the password is visible in the script text (and in the job output/history
    // on the server) - same as with the ConvertTo-SecureString variant, it's just
    // additionally visible briefly as a CLI argument while net.exe runs.
    script:
      '# --- OBAVEZNO izmeni korisnicko ime i lozinku pre slanja! ---\n' +
      '$Username = "RemoteAdmin"\n' +
      '$Password = "gibson"\n' +
      '# ----------------------------------------------------------------\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '\n' +
      'try {\n' +
      '    net user $Username 2>&1 | Out-Null\n' +
      '    $userExists = ($LASTEXITCODE -eq 0)\n' +
      '\n' +
      '    if (-not $userExists) {\n' +
      '        net user $Username $Password /add /fullname:"Remote Administration" /comment:"Remote administration account" | Out-Null\n' +
      '        if ($LASTEXITCODE -ne 0) {\n' +
      '            throw "net user /add zavrsio sa exit kodom $LASTEXITCODE"\n' +
      '        }\n' +
      '\n' +
      '        net localgroup Administrators $Username /add | Out-Null\n' +
      '        if ($LASTEXITCODE -ne 0) {\n' +
      '            throw "net localgroup /add zavrsio sa exit kodom $LASTEXITCODE"\n' +
      '        }\n' +
      '\n' +
      '        Write-Output "Korisnik \'$Username\' kreiran i dodat u Administrators."\n' +
      '    }\n' +
      '    else {\n' +
      '        Write-Output "Korisnik \'$Username\' vec postoji, preskoceno kreiranje."\n' +
      '    }\n' +
      '\n' +
      '    $specialAccountsPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\SpecialAccounts\\UserList"\n' +
      '    if (-not (Test-Path $specialAccountsPath)) {\n' +
      '        New-Item -Path $specialAccountsPath -Force | Out-Null\n' +
      '    }\n' +
      '    New-ItemProperty -Path $specialAccountsPath -Name $Username -PropertyType DWord -Value 0 -Force | Out-Null\n' +
      '\n' +
      '    Write-Output "Korisnik \'$Username\' sakriven sa ekrana za prijavu."\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'install-netdesk-agent-manager',
    label: 'Instaliraj/ažuriraj NetdeskAgent Manager servis',
    // Bootstrap rollout for NetdeskAgentManager (a new, independent service - see
    // service/README.md) - a "chicken and egg" problem, the first install on the
    // fleet goes precisely through this run_powershell_script mechanism. Idempotent
    // (safe to resend/for future manual updates of the Manager itself) -
    // if the service already exists, it is first COMPLETELY removed (stopped, uninstalled
    // via InstallUtil /u, AND THEN additionally sc.exe delete as a safe
    // fallback - InstallUtil's /u can leave the service in a "marked for
    // deletion" limbo in the SCM until the last handle is closed, instead of
    // really disappearing right away, which would make a later fresh InstallUtil Install() hit a
    // "service already exists" error) BEFORE any of the old
    // files/folders are touched. The same download pattern as the deploy-trusted-root-cert
    // preset (OS-dependent URL, TLS 1.2 forced, WebClient.DownloadFile) and
    // the same InstallUtil/OS-bitness/sc failure recipe as the manual Service
    // install in DEPLOYMENT.md. Also deletes manager-state.json on every
    // run (deliberately unconditional, see the note inside the script) - the Manager
    // never recovers on its own if the server loses/invalidates its identity,
    // so this preset is also the "force fresh re-enroll" recipe.
    script:
      '# --- Izmeni ove redove pre slanja ako se promene ---\n' +
      '$pkgUrlWin7 = "https://netdesk.local:3000/uploads/downloads/NetdeskAgentManager.zip"\n' +
      '$pkgUrlModern = "https://10.230.62.81:3000/uploads/downloads/NetdeskAgentManager.zip"\n' +
      '# Za Manager-ov NOVI, nezavisni HTTP kanal (enroll/heartbeat/job-poll) -\n' +
      '# isti hostovi kao pkgUrl iznad (OS-zavisno, ista mreža/DNS ogranicenja),\n' +
      '# ali SOPSTVENI enroll token (MANAGER_ENROLL_TOKEN u backend .env, ne\n' +
      '# AGENT_ENROLL_TOKEN - videti napomenu u config/env.js zašto su odvojeni).\n' +
      '# Ako $managerEnrollToken ostane prazan, config.json se ne piše i Manager\n' +
      '# i dalje radi normalno preko starog mailbox puta, samo bez novog kanala.\n' +
      '$serverBaseUrlWin7 = "https://netdesk.local:3000"\n' +
      '$serverBaseUrlModern = "https://10.230.62.81:3000"\n' +
      '$managerEnrollToken = "97eb906e34d5645307abbda3af22f21783e501dad5f9e53c"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$serviceName = "NetdeskAgentManager"\n' +
      '$installDir = "C:\\Program Files\\NetdeskAgent\\Manager"\n' +
      '$configDir = "C:\\ProgramData\\NetdeskAgentManager"\n' +
      '$configFile = Join-Path $configDir "config.json"\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$pkgUrl = if ($isWin7) { $pkgUrlWin7 } else { $pkgUrlModern }\n' +
      '$serverBaseUrl = if ($isWin7) { $serverBaseUrlWin7 } else { $serverBaseUrlModern }\n' +
      '\n' +
      '$installUtilPath = if ([Environment]::Is64BitOperatingSystem) {\n' +
      '  "$env:WINDIR\\Microsoft.NET\\Framework64\\v4.0.30319\\InstallUtil.exe"\n' +
      '} else {\n' +
      '  "$env:WINDIR\\Microsoft.NET\\Framework\\v4.0.30319\\InstallUtil.exe"\n' +
      '}\n' +
      '\n' +
      'try {\n' +
      '    $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue\n' +
      '    if ($existing) {\n' +
      '        if ($existing.Status -ne "Stopped") {\n' +
      '            Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue\n' +
      '        }\n' +
      '        & $installUtilPath /u "$installDir\\Netdesk.Agent.Manager.exe" 2>&1 | Out-Null\n' +
      '\n' +
      '        # Siguran fallback - garantuje da servis stvarno nestane iz SCM-a\n' +
      '        # (ne samo da InstallUtil /u misli da je uspeo) pre nego što se\n' +
      '        # ide dalje. Do 10 pokušaja/1s - isti "prolazan lock/lag" razlog\n' +
      '        # kao DirectorySync retry na agent strani, samo za SCM stanje\n' +
      '        # umesto fajl handle-a.\n' +
      '        sc.exe delete $serviceName | Out-Null\n' +
      '        for ($i = 0; $i -lt 10; $i++) {\n' +
      '            if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) { break }\n' +
      '            Start-Sleep -Seconds 1\n' +
      '        }\n' +
      '        if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {\n' +
      '            throw "Stari servis \'$serviceName\' i dalje postoji u SCM-u posle sc.exe delete - prekidam da ne bih instalirao preko poluobrisanog servisa."\n' +
      '        }\n' +
      '    }\n' +
      '\n' +
      '    $zipPath = Join-Path $env:TEMP "NetdeskAgentManager.zip"\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($pkgUrl, $zipPath)\n' +
      '\n' +
      '    # KOMPLETNO brisanje starih fajlova - ne oslanjamo se na Expand-Archive\n' +
      '    # -Force da selektivno prepiše/ostavi stare fajlove koji možda više\n' +
      '    # ne postoje u novom paketu (npr. stara zavisnost uklonjena).\n' +
      '    if (Test-Path $installDir) {\n' +
      '        Remove-Item $installDir -Recurse -Force\n' +
      '    }\n' +
      '    New-Item -ItemType Directory -Path $installDir -Force | Out-Null\n' +
      '    Expand-Archive -Path $zipPath -DestinationPath $installDir -Force\n' +
      '    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue\n' +
      '\n' +
      '    & $installUtilPath "$installDir\\Netdesk.Agent.Manager.exe"\n' +
      '    if ($LASTEXITCODE -ne 0) {\n' +
      '        throw "InstallUtil je vratio exit kod $LASTEXITCODE"\n' +
      '    }\n' +
      '\n' +
      '    # Config za novi, nezavisni HTTP kanal - NAMERNO samo ako fajl JOŠ NE\n' +
      '    # postoji, da ponovno slanje ovog preset-a (update Manager BINARNOG\n' +
      '    # fajla) ne prepiše/obriše već-enrollovanu mašinu\'s postavke. Ako je\n' +
      '    # $managerEnrollToken prazan, preskače se potpuno - Manager i dalje\n' +
      '    # radi normalno preko starog mailbox puta, samo bez novog kanala.\n' +
      '    if ($managerEnrollToken -and -not (Test-Path $configFile)) {\n' +
      '        New-Item -ItemType Directory -Path $configDir -Force | Out-Null\n' +
      '        $config = @{ ServerBaseUrl = $serverBaseUrl; EnrollToken = $managerEnrollToken } | ConvertTo-Json\n' +
      '        Set-Content -Path $configFile -Value $config -Encoding UTF8\n' +
      '    }\n' +
      '\n' +
      '    # Bezuslovno brisanje na SVAKI install/update run - namerno (videti\n' +
      '    # service/README.md, "Netdesk Agent Manager": ManagerState.IsEnrolled\n' +
      '    # je čisto lokalni keš, Manager se NIKAD sam ne oporavlja ako server\n' +
      '    # izgubi/invalidira taj identitet - ostaje zauvek "enrolled" lokalno i\n' +
      '    # tiho puca na heartbeat/poll). Odabrana jednostavnost: svaki run ovog\n' +
      '    # preseta radi svež enroll, čak i na već zdravoj mašini - stari red u\n' +
      '    # managers tabeli ostaje kao siroče (nikad više ne heartbeat-uje), ne\n' +
      '    # briše se automatski.\n' +
      '    $stateFile = Join-Path $configDir "manager-state.json"\n' +
      '    if (Test-Path $stateFile) {\n' +
      '        Remove-Item $stateFile -Force\n' +
      '    }\n' +
      '\n' +
      '    sc.exe start $serviceName | Out-Null\n' +
      '    Start-Sleep -Seconds 2\n' +
      '    $status = (Get-Service -Name $serviceName -ErrorAction SilentlyContinue).Status\n' +
      '    if ($status -ne "Running") {\n' +
      '        throw "Servis \'$serviceName\' nije u Running stanju posle starta (status: $status)."\n' +
      '    }\n' +
      '\n' +
      '    sc.exe failure $serviceName reset=86400 actions=restart/60000/restart/60000/restart/60000 | Out-Null\n' +
      '\n' +
      '    "NetdeskAgentManager instaliran i pokrenut (paket: $pkgUrl)."\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'force-stop-windivert-driver',
    label: 'Prinudno zaustavi WinDivert drajver (ako blokira update fajlova)',
    // Doesn't rely on a hardcoded driver service name ("WinDivert" is
    // what the actual install uses, but it's NOT part of the officially
    // documented contract of the WinDivert library, and could theoretically change
    // between versions/forks) - instead, it finds the driver BY THE PATH to
    // WinDivert64.sys via Win32_SystemDriver (the WMI class for kernel-mode
    // drivers/services, DIFFERENT from Win32_PnPSignedDriver used by the
    // "delete device driver" preset above - that one is for PnP hardware devices,
    // WinDivert isn't a PnP device, it wouldn't even show up there).
    //
    // Same motive as the retry-with-backoff in DirectorySync.cs (Manager/Common)
    // - WinDivert64.sys can stay locked for a short TIME even AFTER the
    // NetdeskAgent process (which opened it) has been confirmed stopped,
    // because driver unload isn't guaranteed to be synchronous with the shutdown of the user-mode
    // process. That retry passively WAITS for the unlock; this preset is a
    // MORE ACTIVE step - it explicitly stops the driver service itself (sc stop),
    // for cases where passive waiting (up to ~6s, 8 attempts/750ms) is still
    // not enough on some particular machine. It deliberately does NOT attempt
    // an uninstall (sc delete) - the driver is automatically reloaded on the
    // next WinDivertOpen() call (the same "dynamically installed, not
    // permanently registered" pattern documented in WinDivertInterop.cs), so
    // just stopping it is enough and less risky than deleting the service.
    //
    // The order relative to the NetdeskAgent service does NOT matter - confirmed live
    // that sc.exe stop succeeds even while the agent process still holds an open
    // WinDivertOpen() handle. DnsQueryCollector.cs's capture loop
    // survives that without crashing (WinDivertRecv starts returning an error, the loop just
    // logs a warning and keeps trying - see CaptureLoop) - a possible
    // short run of "WinDivertRecv failed" lines in the agent log is harmless
    // and only lasts until the agent stops anyway as part of the same update flow.
    script:
      '$ErrorActionPreference = "Stop"\n' +
      '$results = New-Object System.Collections.Generic.List[string]\n' +
      '\n' +
      '$drivers = Get-CimInstance -ClassName Win32_SystemDriver -ErrorAction SilentlyContinue |\n' +
      '    Where-Object { $_.PathName -like "*WinDivert64.sys*" -or $_.Name -like "*WinDivert*" }\n' +
      '\n' +
      'if (-not $drivers) {\n' +
      '    "WinDivert drajver nije pronadjen kao ucitan servis - vec je otkacen ili nikad nije ucitan."\n' +
      '    exit 0\n' +
      '}\n' +
      '\n' +
      'foreach ($drv in $drivers) {\n' +
      '    $name = $drv.Name\n' +
      '    if ($drv.State -eq "Stopped") {\n' +
      '        $results.Add("$name : vec zaustavljen")\n' +
      '        continue\n' +
      '    }\n' +
      '\n' +
      '    try {\n' +
      '        $out = sc.exe stop $name 2>&1\n' +
      '        $stopped = $false\n' +
      '        for ($i = 0; $i -lt 10; $i++) {\n' +
      '            Start-Sleep -Seconds 1\n' +
      '            $check = Get-CimInstance -ClassName Win32_SystemDriver -Filter "Name=\'$name\'" -ErrorAction SilentlyContinue\n' +
      '            if (-not $check -or $check.State -eq "Stopped") { $stopped = $true; break }\n' +
      '        }\n' +
      '        if ($stopped) {\n' +
      '            $results.Add("$name : uspesno zaustavljen")\n' +
      '        } else {\n' +
      '            $results.Add(("{0} : NIJE zaustavljen (verovatno jos otvoren handle iz NetdeskAgent procesa) - {1}" -f $name, ($out -join " ")))\n' +
      '        }\n' +
      '    }\n' +
      '    catch {\n' +
      '        $results.Add("$name : GRESKA - $($_.Exception.Message)")\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      'Write-Output ($results -join "`n")',
  },
  {
    id: 'enable-wake-on-lan',
    label: 'Uključi Wake-on-LAN na mrežnim karticama',
    // The OS-level part of the Wake-on-LAN setup (Device Manager "Allow this device
    // to wake the computer" + the "Wake on Magic Packet" advanced setting) -
    // the BIOS/UEFI "Wake on LAN"/"Power On By PCI-E" must stay enabled by hand
    // per machine, that can't be configured remotely through the OS.
    //
    // powercfg /deviceenablewake (not WMI/registry directly) on purpose - it works
    // identically from Windows 7 to 11, while the NetAdapter module (Set-
    // NetAdapterPowerManagement / Set-NetAdapterAdvancedProperty, which additionally
    // enables the specific "Wake on Magic Packet" advanced property instead of
    // just the general "allow wake") is only available since Windows 8/Server 2012 -
    // on Windows 7 that part is silently skipped, the powercfg step above is the
    // only available mechanism there.
    //
    // Win32_NetworkAdapter (WMI, not Get-NetAdapter -Physical) for the list of
    // physical adapters - also available on Windows 7, where Get-NetAdapter doesn't
    // exist. "Wake on Magic Packet" is the usual DisplayName for
    // most network drivers (Intel/Realtek/Broadcom), but it isn't guaranteed to be
    // identical on every one - Get-NetAdapterAdvancedProperty first checks
    // whether the property exists under that name at all, so it's skipped without an error
    // if the driver uses a different name.
    script:
      '$ErrorActionPreference = "Stop"\n' +
      '$results = New-Object System.Collections.Generic.List[string]\n' +
      '\n' +
      '$adapters = Get-WmiObject -Class Win32_NetworkAdapter -ErrorAction SilentlyContinue |\n' +
      '    Where-Object { $_.PhysicalAdapter -eq $true -and $_.NetConnectionID }\n' +
      '\n' +
      'if (-not $adapters) {\n' +
      '    "Nije pronadjena nijedna fizicka mrezna kartica."\n' +
      '    exit 0\n' +
      '}\n' +
      '\n' +
      'foreach ($adapter in $adapters) {\n' +
      '    $name = $adapter.Name\n' +
      '    try {\n' +
      '        $out = powercfg /deviceenablewake "$name" 2>&1\n' +
      '        if ($LASTEXITCODE -eq 0) {\n' +
      '            $results.Add(("{0}: \'Allow this device to wake the computer\' ukljuceno" -f $name))\n' +
      '        } else {\n' +
      '            $results.Add(("{0}: powercfg GRESKA - {1}" -f $name, ($out -join \' \')))\n' +
      '        }\n' +
      '    }\n' +
      '    catch {\n' +
      '        $results.Add(("{0}: GRESKA - {1}" -f $name, $_.Exception.Message))\n' +
      '    }\n' +
      '}\n' +
      '\n' +
      'if (Get-Module -ListAvailable -Name NetAdapter) {\n' +
      '    Import-Module NetAdapter -ErrorAction SilentlyContinue\n' +
      '    Get-NetAdapter -Physical -ErrorAction SilentlyContinue | ForEach-Object {\n' +
      '        $adapterName = $_.Name\n' +
      '        try {\n' +
      '            Set-NetAdapterPowerManagement -Name $adapterName -WakeOnMagicPacket Enabled -ErrorAction Stop\n' +
      '            $results.Add(("{0}: WakeOnMagicPacket ukljucen (Set-NetAdapterPowerManagement)" -f $adapterName))\n' +
      '        }\n' +
      '        catch {\n' +
      '            $results.Add(("{0}: Set-NetAdapterPowerManagement GRESKA - {1}" -f $adapterName, $_.Exception.Message))\n' +
      '        }\n' +
      '\n' +
      '        try {\n' +
      '            $prop = Get-NetAdapterAdvancedProperty -Name $adapterName -DisplayName "Wake on Magic Packet" -ErrorAction SilentlyContinue\n' +
      '            if ($prop) {\n' +
      '                Set-NetAdapterAdvancedProperty -Name $adapterName -DisplayName "Wake on Magic Packet" -DisplayValue "Enabled" -ErrorAction Stop\n' +
      '                $results.Add(("{0}: \'Wake on Magic Packet\' napredno podesavanje ukljuceno" -f $adapterName))\n' +
      '            }\n' +
      '        }\n' +
      '        catch {\n' +
      '            $results.Add(("{0}: \'Wake on Magic Packet\' napredno podesavanje GRESKA - {1}" -f $adapterName, $_.Exception.Message))\n' +
      '        }\n' +
      '    }\n' +
      '} else {\n' +
      '    $results.Add("NetAdapter modul nije dostupan (verovatno Windows 7) - samo powercfg korak primenjen.")\n' +
      '}\n' +
      '\n' +
      'Write-Output ($results -join "`n")\n' +
      'Write-Output ""\n' +
      'Write-Output "NAPOMENA: BIOS/UEFI podesavanje (\'Wake on LAN\'/\'Power On By PCI-E\'/slicno) mora biti rucno ukljuceno na ovoj masini - to se ne moze setovati daljinski."',
  },
  {
    id: 'fix-antivirus-defender',
    label: '🔧 Popravi: Antivirus (Windows Defender realtime)',
    // The "Popravi" (fix) button on AgentDetailView (next to the Antivirus status) sends exactly
    // this preset by id - see fixJobPresetId() in that component. Best-
    // effort, NOT a guaranteed fix: agent.monitoring.antivirusStatus is
    // computed from WMI root\SecurityCenter2\AntiVirusProduct (see
    // MonitoringCollector.cs CollectAntivirusStatus) - if the registered AV
    // product is third-party (not Windows Defender), this script has nothing to
    // enable and reports that clearly instead of a false "success".
    //
    // Set-MpPreference/Get-MpComputerStatus come from the Defender PowerShell
    // module, which only exists from Windows 8.1/Server 2012 R2 onwards - the old
    // Windows Defender on Windows 7 (an anti-spyware tool predating the modern AV
    // engine) doesn't have those cmdlets at all, regardless of the PowerShell version
    // (the WMF 5.1 upgrade only upgrades the PowerShell engine itself, not modules tied to
    // OS components) - confirmed live on Windows 7 SP1 ("term not
    // recognized"). -ErrorAction SilentlyContinue on the call ITSELF doesn't
    // help there - "term not recognized" is a CommandNotFoundException that
    // $ErrorActionPreference = "Stop" treats as a terminating ERROR before
    // the cmdlet's own -ErrorAction even comes into play.
    // That's why module availability is checked BEFORE the call (Get-Command), instead of
    // relying on try/catch to catch the error.
    script:
      '$ErrorActionPreference = "Stop"\n' +
      'try {\n' +
      '    $svc = Get-Service -Name WinDefend -ErrorAction SilentlyContinue\n' +
      '    if (-not $svc) {\n' +
      '        "Windows Defender (WinDefend) servis nije pronadjen na ovoj masini - verovatno je instaliran drugi antivirus program, ova skripta ne moze da ga popravi."\n' +
      '        exit 0\n' +
      '    }\n' +
      '\n' +
      '    if ($svc.Status -ne "Running") {\n' +
      '        Start-Service -Name WinDefend\n' +
      '    }\n' +
      '\n' +
      '    $hasDefenderModule = [bool](Get-Command -Name Set-MpPreference -ErrorAction SilentlyContinue)\n' +
      '    if (-not $hasDefenderModule) {\n' +
      '        "WinDefend servis je pokrenut, ali Defender PowerShell modul (Set-MpPreference/Get-MpComputerStatus) nije dostupan na ovoj verziji Windows-a (verovatno Windows 7) - realtime zastita se ovde ne moze programski ukljuciti/proveriti, proveri rucno kroz Defender/Security Center UI."\n' +
      '        exit 0\n' +
      '    }\n' +
      '\n' +
      '    Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue\n' +
      '    Start-Sleep -Seconds 2\n' +
      '\n' +
      '    $status = Get-MpComputerStatus -ErrorAction SilentlyContinue\n' +
      '    if ($status -and $status.RealTimeProtectionEnabled) {\n' +
      '        "Windows Defender realtime zastita je ukljucena."\n' +
      '    } else {\n' +
      '        "Pokusano ukljucivanje Windows Defender-a, ali status se i dalje ne prijavljuje kao aktivan - proveri rucno (moguce je da je iskljucen preko Group Policy-ja ili da postoji drugi AV)."\n' +
      '        exit 1\n' +
      '    }\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'fix-firewall',
    label: '🔧 Popravi: Windows Firewall',
    // The "Popravi" (fix) button on AgentDetailView (next to the Firewall status) sends exactly
    // this preset by id. agent.monitoring.firewallStatus is read directly
    // from the registry (StandardProfile\EnableFirewall - see
    // MonitoringCollector.cs CollectFirewallStatus), hence "netsh advfirewall
    // set allprofiles state on" (changes that same registry value for all
    // profiles, including StandardProfile) - not the Set-NetFirewallProfile
    // cmdlet, same reason as the allow-cross-subnet-icmp preset above (the NetSecurity
    // module only since Windows 8, netsh works identically from XP SP2 to Windows 11).
    script:
      '$ErrorActionPreference = "Stop"\n' +
      'try {\n' +
      '    $svc = Get-Service -Name MpsSvc -ErrorAction SilentlyContinue\n' +
      '    if ($svc -and $svc.Status -ne "Running") {\n' +
      '        Start-Service -Name MpsSvc\n' +
      '    }\n' +
      '\n' +
      '    $out = netsh advfirewall set allprofiles state on\n' +
      '    if ($LASTEXITCODE -ne 0) {\n' +
      '        throw "netsh je vratio exit kod $LASTEXITCODE - $($out -join \' \')"\n' +
      '    }\n' +
      '\n' +
      '    "Windows Firewall ukljucen na svim profilima (Domain/Private/Public)."\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
  {
    id: 'fix-windows-update-service',
    label: '🔧 Popravi: Windows Update servis (wuauserv)',
    // The "Popravi" (fix) button on AgentDetailView (next to the Windows Update status) sends
    // exactly this preset by id. agent.windowsUpdateStatus is the Status of the wuauserv
    // service (see WindowsUpdateCollector.CollectServiceInfo/GetWuauservState)
    // - if StartType is "Disabled" (e.g. some GPO/tweak tool has
    // disabled it), Start-Service alone wouldn't start it (it throws an error), so first
    // StartupType Manual (the Windows default for wuauserv - deliberately NOT Automatic,
    // so behavior isn't changed beyond what the OS default is).
    script:
      '$ErrorActionPreference = "Stop"\n' +
      'try {\n' +
      '    $svc = Get-Service -Name wuauserv -ErrorAction Stop\n' +
      '    if ($svc.StartType -eq "Disabled") {\n' +
      '        Set-Service -Name wuauserv -StartupType Manual\n' +
      '    }\n' +
      '    if ($svc.Status -ne "Running") {\n' +
      '        Start-Service -Name wuauserv\n' +
      '    }\n' +
      '    Start-Sleep -Seconds 2\n' +
      '\n' +
      '    $status = (Get-Service -Name wuauserv).Status\n' +
      '    if ($status -eq "Running") {\n' +
      '        "Windows Update servis (wuauserv) je pokrenut."\n' +
      '    } else {\n' +
      '        "Pokusano pokretanje wuauserv servisa, ali status je i dalje \'$status\' - proveri rucno (moguce je da je onemogucen preko Group Policy-ja)."\n' +
      '        exit 1\n' +
      '    }\n' +
      '}\n' +
      'catch {\n' +
      '    Write-Output "GRESKA: $($_.Exception.Message)"\n' +
      '    exit 1\n' +
      '}',
  },
]
