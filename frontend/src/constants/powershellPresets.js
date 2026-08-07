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
    // Bez #requires -RunAsAdministrator (originalna verzija skripte ga je
    // imala) - to je parse-time provera VAN try/catch-a, pa bi eventualni
    // neuspeh te provere zaobišao skriptin sopstveni error-handling i javio
    // se kao sirova PowerShell greška umesto lepe "ERROR: ..." poruke. Agent
    // pokreće run_powershell_script jobove pod LocalSystem nalogom
    // (JobExecutor.cs), koji već ima puna prava nad HKLM bez obzira na tu
    // proveru - dodavala bi rizik bez stvarne dodatne zaštite u ovom
    // kontekstu (dispatch je već admin-only na nivou same aplikacije).
    // Registry putanje/vrednosti su stvarne, dokumentovane enterprise
    // politike svakog browsera (Chromium trojka deli DnsOverHttpsMode šemu,
    // Firefox ima svoju DNSOverHTTPS/Enabled+Locked šemu) - browseri
    // moraju biti restartovani da bi promena stvarno stupila na snagu.
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
    id: 'list-agent-service-folder',
    label: 'Prikaži sadržaj foldera NetdeskAgent\\Service',
    // Diagnostika stvarno instaliranog stanja na target mašini (fajlovi,
    // veličine, datumi izmene) - bez potrebe za RDP/AnyDesk pristupom,
    // korisno za poređenje sa DEPLOYMENT.md spiskom očekivanih fajlova
    // (npr. da li je stvarno stigla nova verzija posle auto-update-a, ili
    // da li fali neki DLL). -Recurse jer amd64\/x86\ podfolderi (TraceEvent
    // native helperi) takođe žive unutar Service\.
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
    id: 'update-agent-config-keys',
    label: 'Upiši više key/value parova u config.json',
    // Isto kao update-agent-config-key iznad, samo za VIŠE ključeva
    // odjednom - $updates hashtable na vrhu je ono što se menja pre slanja
    // (dodaj/ukloni parove po potrebi), ostatak skripte se ne dira.
    //
    // VAŽNO - tip vrednosti u hashtable-u isto određuje JSON tip kao u
    // pojedinačnom preset-u iznad:
    //   300        -> upisuje se kao BROJ u JSON
    //   "300"      -> upisuje se kao STRING u JSON
    //   $true      -> upisuje se kao BOOLEAN u JSON
    // Poklopi svaku vrednost sa stvarnim tipom tog polja u AgentSettings.cs.
    //
    // Add-Member -Force po ključu (ista logika kao pojedinačni preset,
    // ponovljena za svaki par u petlji) - radi i ako ključ već postoji
    // (prepiše ga) i ako ne postoji (doda ga bez greške).
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
    // Destruktivno i teško povratno (treba ponovna instalacija) - proveri
    // $appName i testiraj na JEDNOM agentu pre batch slanja.
    //
    // Traži po DisplayName (deo imena je dovoljan) kroz oba uninstall
    // registry čvora (64-bit i 32-bit-na-64-bit/"WOW6432Node") - HKCU se
    // namerno ne pretražuje, agent radi kao LocalSystem u Session 0 bez
    // učitanog korisničkog hive-a, pa po-korisnika instalirani programi
    // (retko, ali postoje) ionako ne bi bili vidljivi/uklonjivi odavde.
    //
    // Prioritet metode gašenja:
    //   1) QuietUninstallString ako ga instalater sam publikuje - najpouzdanije
    //   2) MSI (UninstallString sadrži MsiExec.exe) - rekonstruiše se u
    //      potpuno tih msiexec /x {GUID} /quiet /norestart poziv
    //   3) Nepoznat EXE deinstaler bez tihe varijante - pokrene se kako jeste,
    //      NIJE garantovano tiho (može tražiti klik) - proveri ručno posle.
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
    // Destruktivno i nepovratno (treba ponovna instalacija softvera koji ga
    // je registrovao) - proveri $serviceName i testiraj na JEDNOM agentu
    // pre batch slanja. Zaustavlja servis prvo ako radi (sc.exe delete na
    // servisu koji radi ga samo markira "pending deletion" dok se ne
    // zaustavi i svi handle-ovi zatvore, pa je čist zaustavi-pa-obriši
    // pouzdaniji).
    //
    // sc.exe delete (ne Remove-Service cmdlet) namerno - Remove-Service
    // postoji tek od PowerShell 6+, a agent cilja i starije Windows/
    // PowerShell verzije (5.1 i niže, uključujući Windows 7).
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
    // Destruktivno i teško povratno (bez originalnog instalacionog paketa
    // teško se vraća) - proveri $driverName i testiraj na JEDNOM agentu pre
    // batch slanja.
    //
    // Traži po DeviceName (deo imena je dovoljan) kroz Win32_PnPSignedDriver
    // (isti WMI izvor koji koristi DriverCollector.cs na agentu za PDSU
    // "Drajveri" tab), uzima InfName (npr. "oem12.inf") i briše ga preko
    // pnputil-a - deinstalira i sam uređaj (/uninstall), ne samo drajver
    // paket iz store-a.
    //
    // pnputil /delete-driver ... /uninstall /force je Windows 10 1607+
    // sintaksa - na Windows 7/8 pnputil ima drugačiji, ograničeniji skup
    // opcija (nema /uninstall), pa ovaj preset tamo neće raditi kako treba.
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
    // Skida sertifikat sa servera (stavi .pem u backend/uploads/downloads/ -
    // ta ruta je namerno bez auth-a, isti mehanizam kao za UltraVNC
    // deployment zip-ove, vidi routes/index.js) i uvozi ga u Local Machine
    // "Trusted Root Certification Authorities" store - agent radi kao
    // LocalSystem, pa certutil -addstore bez -user cilja bas taj store
    // (potvrđeno uživo).
    //
    // Namenjeno pre svega za UNAPRED distribuiranje novog mkcert CA root-a
    // na flotu PRE nego što se server-side sertifikat rotira - tako se
    // izbegava "chicken-and-egg" period kad agent ne veruje novom
    // sertifikatu jer mu CA nikad nije uvezen (uzivo otkriven scenario).
    //
    // TLS 1.2 se eksplicitno forsira na OVAJ PowerShell proces - on je
    // odvojen .NET runtime od samog agent servisa (agent to postavlja samo
    // za sebe u NetdeskApiClient.cs), pa bez ovoga isti Windows 7 problem
    // (TLS handshake ne uspeva) pogađa i sam download unutar ove skripte.
    //
    // Windows 7 mašine u floti idu preko netdesk.local (hosts unos), a
    // Windows 10/11 direktno preko IP-a - sertifikat trenutno pokriva oba
    // (SAN ima i DNS Name i IP Address), ali skripta ipak bira URL po OS
    // verziji da prati isti obrazac po kom su agenti stvarno podešeni.
    // Win32_OperatingSystem.Version za Windows 7 je "6.1.*" (Vista je 6.0,
    // Windows 8/8.1 su 6.2/6.3, Windows 10 i 11 su oba "10.0.*").
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
    // Isto kao 'deploy-trusted-root-cert', samo cilja Local Machine
    // "Intermediate Certification Authorities" store (certutil naziv "CA")
    // umesto "Trusted Root Certification Authorities" - vidi taj preset za
    // puno objašnjenje TLS 1.2 forsiranja i OS-zavisnog URL-a.
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
    // Read-only dijagnostika, pandan deploy-trusted-root-cert presetu -
    // umesto labavog pretraživanja po nazivu (moglo bi pogoditi neki STARI
    // mkcert CA i lažno prijaviti "instaliran" iako je pogrešan), skida
    // TRENUTNI referentni sertifikat sa servera (isti /uploads/downloads/rootCA.pem
    // i isti OS-zavisan URL/TLS1.2 kao deploy preset) i poredi ga sa Local
    // Machine "Trusted Root Certification Authorities" store-om (Cert:
    // provider) TAČNO po Thumbprint-u.
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
    // Isto kao 'check-trusted-root-cert', samo cilja Local Machine
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
    // Uživo otkriven uzrok: ugrađeno "File and Printer Sharing (Echo
    // Request - ICMPv4-In)" pravilo za Private/Domain profile ima domet
    // (RemoteAddress) ograničen na LocalSubnet - server na drugoj lokaciji/
    // podmreži (npr. Bolnica 10.230.62.x -> Dom zdravlja agent 10.160.64.x)
    // se nikad ne poklopi, bez obzira što pravilo pokazuje "Enabled: True".
    // Postoji i "restriktivna" varijanta sa dometom Any, ali je ugrađeno
    // uključena SAMO za Public profil - zato menjanje mreže na Public
    // "popravi" ping, a ostajanje na Private (ispravnijem, bezbednijem
    // izboru za internu mrežu) ne radi.
    //
    // Namerno netsh advfirewall umesto Get/Set-NetFirewallRule cmdleta:
    // 1) NetSecurity modul (te cmdlete obezbeđuje) postoji tek od Windows 8/
    //    Server 2012 - na Windows 7 bi preset tiho pao. netsh advfirewall
    //    radi identično od Windows 7 do 11.
    // 2) Ugrađena pravila imaju LOKALIZOVAN DisplayName (npr. "Deljenje
    //    datoteka i štampača..." na srpskom, "File and Printer Sharing..."
    //    na engleskom) - pokušaj da se nađe/uključi POSTOJEĆE pravilo po
    //    imenu bio bi lomljiv na mešovitoj floti. Umesto toga, ova skripta
    //    dodaje SOPSTVENO, potpuno novo pravilo sa fiksnim (ne-lokalizovanim)
    //    imenom - bez zavisnosti od jezika sistema ili tačnog naziva
    //    postojećih pravila.
    //
    // Brisanje pa ponovno dodavanje na početku čini skriptu bezbednom za
    // ponovno slanje (ne gomila duple kopije istog pravila).
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
    // Kreira lokalni admin nalog i sakriva ga sa ekrana za prijavu (upisom u
    // Winlogon\SpecialAccounts\UserList) - nalog i dalje normalno radi za
    // RDP/net use/itd, samo se ne nudi kao opcija na login ekranu.
    // Idempotentno - ako korisnik već postoji, samo se preskoči kreiranje
    // (i dalje se primeni "sakrij" korak, bezopasno ako je već sakriven).
    //
    // Namerno net.exe (net user/net localgroup) umesto New-LocalUser/
    // Get-LocalUser cmdleta - ovi poslednji dolaze iz LocalAccounts modula
    // koji postoji tek od Windows 10/Server 2016, pa bi preset tiho pao na
    // Windows 7 delu flote. net.exe radi identično na svim verzijama.
    //
    // Napomena: lozinka je vidljiva u tekstu skripte (i u job output/istoriji
    // na serveru) - isto kao i sa ConvertTo-SecureString varijantom, samo je
    // ovde dodatno kratko vidljiva i kao CLI argument dok net.exe radi.
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
    id: 'restart-netdesk-agent-deferred',
    label: 'Restartuj NetdeskAgent servis (odloženo, bezbedno)',
    // Restartovanje servisa iz JOBA KOJI TAJ ISTI SERVIS IZVRŠAVA ne sme da
    // ide preko obične ServiceController.Restart logike (restart_service
    // komanda) - agent bi ubio sam sebe pre nego što stigne da prijavi
    // rezultat serveru, pa bi job ostao zauvek zaglavljen na "sent". Umesto
    // toga, Start-Process (bez -Wait) samo pokrene odvojen, "siroče" proces
    // i odmah se vrati - ovaj PowerShell proces (koji job čeka) se završi za
    // par milisekundi, job se prijavi kao uspešan, a stvarni restart se desi
    // tek 5 sekundi kasnije, potpuno nezavisno od agent procesa koji ga je
    // pokrenuo.
    //
    // Restart-Service (PowerShell cmdlet, ide direktno kroz SCM API) umesto
    // cmd.exe + "net stop X & net start X" - uživo otkriveno da mrežni IPS/
    // EDR na putu ka statičkoj javnoj IP adresi resetuje konekciju čim telo
    // zahteva sadrži baš taj obrazac (skriveni cmd.exe koji gasi-pa-pali
    // servis - klasičan potpis za "gašenje bezbednosnog agenta"), dok isti
    // zahtev sa bilo kojim drugim sadržajem prolazi normalno. Restart-Service
    // ne spawn-uje cmd.exe/net.exe uopšte, pa ne nosi taj potpis - ali ovo je
    // zaobilaženje simptoma, ne rešenje osnovnog uzroka; IPS/firewall na toj
    // lokaciji i dalje treba izuzetak za port 3000 od strane IT-a.
    script:
      'Start-Process -FilePath "powershell.exe" `\n' +
      '  -ArgumentList \'-NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Restart-Service -Name NetdeskAgent -Force"\' `\n' +
      '  -WindowStyle Hidden',
  },
  {
    id: 'install-netdesk-agent-manager',
    label: 'Instaliraj/ažuriraj NetdeskAgent Manager servis',
    // Bootstrap rollout za NetdeskAgentManager (nov, nezavisan servis - vidi
    // service/README.md) - "kokoška i jaje" problem, prva instalacija na
    // flotu ide baš preko ovog run_powershell_script mehanizma. Idempotentan
    // (bezbedan za ponovno slanje/buduće ručne update-ove Manager-a samog) -
    // ako servis već postoji, prvo se zaustavi i deinstalira pre svežeg
    // upisa fajlova. Isti obrazac preuzimanja kao deploy-trusted-root-cert
    // preset (OS-zavisan URL, TLS 1.2 forsiran, WebClient.DownloadFile) i
    // isti InstallUtil/OS-bitness/sc failure recept kao ručna Service
    // instalacija u DEPLOYMENT.md.
    script:
      '# --- Izmeni ova dva reda pre slanja ako se promene ---\n' +
      '$pkgUrlWin7 = "https://netdesk.local:3000/uploads/downloads/NetdeskAgentManager.zip"\n' +
      '$pkgUrlModern = "https://10.230.62.81:3000/uploads/downloads/NetdeskAgentManager.zip"\n' +
      '# --------------------------------------------------------\n' +
      '\n' +
      '$serviceName = "NetdeskAgentManager"\n' +
      '$installDir = "C:\\Program Files\\NetdeskAgent\\Manager"\n' +
      '\n' +
      '$ErrorActionPreference = "Stop"\n' +
      '[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12\n' +
      '\n' +
      '$osVersion = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction SilentlyContinue).Version\n' +
      '$isWin7 = $osVersion -like "6.1*"\n' +
      '$pkgUrl = if ($isWin7) { $pkgUrlWin7 } else { $pkgUrlModern }\n' +
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
      '    }\n' +
      '\n' +
      '    $zipPath = Join-Path $env:TEMP "NetdeskAgentManager.zip"\n' +
      '    $wc = New-Object System.Net.WebClient\n' +
      '    $wc.DownloadFile($pkgUrl, $zipPath)\n' +
      '\n' +
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
    id: 'enable-wake-on-lan',
    label: 'Uključi Wake-on-LAN na mrežnim karticama',
    // OS-nivo deo Wake-on-LAN podešavanja (Device Manager "Allow this device
    // to wake the computer" + "Wake on Magic Packet" napredno podešavanje) -
    // BIOS/UEFI "Wake on LAN"/"Power On By PCI-E" mora ostati ručno uključen
    // po mašini, to se ne može podesiti daljinski preko OS-a.
    //
    // powercfg /deviceenablewake (ne WMI/registry direktno) namerno - radi
    // identično od Windows 7 do 11, dok je NetAdapter modul (Set-
    // NetAdapterPowerManagement / Set-NetAdapterAdvancedProperty, dodatno
    // uključuje konkretno "Wake on Magic Packet" napredno svojstvo umesto
    // samo opšteg "dozvoli buđenje") dostupan tek od Windows 8/Server 2012 -
    // na Windows 7 se taj deo tiho preskoči, powercfg korak iznad je tamo
    // jedini dostupan mehanizam.
    //
    // Win32_NetworkAdapter (WMI, ne Get-NetAdapter -Physical) za listu
    // fizičkih kartica - dostupno i na Windows 7, gde Get-NetAdapter ne
    // postoji. "Wake on Magic Packet" DisplayName je uobičajen naziv kod
    // većine mrežnih drajvera (Intel/Realtek/Broadcom), ali nije garantovano
    // identičan na svakom - Get-NetAdapterAdvancedProperty pre toga proverava
    // da li svojstvo uopšte postoji pod tim imenom, pa se preskače bez greške
    // ako drajver koristi drugačiji naziv.
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
]
