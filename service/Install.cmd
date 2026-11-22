@echo off
rem Netdesk Agent - fully silent install, including prerequisites.
rem Works on a bare Windows 7 SP1 (cmd.exe only - no .NET/PowerShell needed to start).
rem Must sit in the same folder as: NetdeskAgentSetup.exe, NDP48-x86-x64-AllOS-ENU.exe,
rem Win7AndW2K8R2-KB3191566-x64.msu, Win7-KB3191566-x86.msu (assembled by Build-Installer.ps1).
rem
rem   Install.cmd           install, then tell the user whether a reboot is needed
rem   Install.cmd /reboot   install, then reboot automatically (30s) if needed
rem
rem Steps already satisfied (.NET 4.8, PowerShell 5.1) are skipped, so the same
rem script works on Windows 10/11 too (it only runs NetdeskAgentSetup.exe there).
rem Messages are ASCII-only (Windows 7 console code page).

setlocal EnableDelayedExpansion
cd /d "%~dp0"

rem Not elevated -> relaunch itself elevated (UAC prompt), so a plain double-click works.
rem PowerShell 2.0 ships with Windows 7 and already has Start-Process -Verb RunAs.
net session >nul 2>&1
if errorlevel 1 (
    if /i "%~1"=="/elevated" goto not_admin
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '/elevated %*' -Verb RunAs" >nul 2>&1
    if errorlevel 1 goto not_admin
    exit /b 0
)
if /i "%~1"=="/elevated" shift

set "LOG=%ProgramData%\NetdeskAgentSetup.log"
set REBOOT=0
set ARCH=x86
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64" set ARCH=x64
if /i "%PROCESSOR_ARCHITEW6432%"=="AMD64" set ARCH=x64

rem Windows 7 = version 6.1 (ver prints e.g. "[Version 6.1.7601]").
set WIN7=0
ver | find "6.1." >nul && set WIN7=1

echo === Netdesk Agent - instalacija (%ARCH%, Win7=%WIN7%)
echo.

rem ---------- .NET Framework 4.8 (Release >= 528040) ----------
set REL=0
for /f "tokens=3" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" /v Release 2^>nul ^| find "Release"') do set /a REL=%%a
if !REL! GEQ 528040 (
    echo [1/3] .NET Framework 4.8 vec instaliran - preskacem.
) else (
    echo [1/3] Instalacija .NET Framework 4.8 ^(par minuta^)...
    if not exist "NDP48-x86-x64-AllOS-ENU.exe" goto missing_net
    "NDP48-x86-x64-AllOS-ENU.exe" /q /norestart
    set RC=!errorlevel!
    if "!RC!"=="3010" set REBOOT=1
    if "!RC!"=="1641" set REBOOT=1
    if not "!RC!"=="0" if not "!RC!"=="3010" if not "!RC!"=="1641" (
        echo GRESKA: .NET 4.8 installer vratio kod !RC!.
        goto fail
    )
    echo       OK
)

rem ---------- WMF 5.1 / PowerShell 5.1 (Windows 7 only) ----------
if "%WIN7%"=="0" (
    echo [2/3] PowerShell 5.1 - nije Windows 7, preskacem.
    goto agent
)
set PSV=
for /f "tokens=3" %%a in ('reg query "HKLM\SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine" /v PowerShellVersion 2^>nul ^| find "PowerShellVersion"') do set PSV=%%a
if "!PSV:~0,3!"=="5.1" (
    echo [2/3] PowerShell 5.1 vec instaliran - preskacem.
    goto agent
)
set "MSU=Win7-KB3191566-x86.msu"
if "%ARCH%"=="x64" set "MSU=Win7AndW2K8R2-KB3191566-x64.msu"
if not exist "%MSU%" goto missing_msu
echo [2/3] Instalacija PowerShell 5.1 ^(%MSU%^)...
wusa.exe "%MSU%" /quiet /norestart
set RC=%errorlevel%
rem 3010 = reboot needed, 2359302 (0x240006) = already installed
if "%RC%"=="3010" set REBOOT=1
if not "%RC%"=="0" if not "%RC%"=="3010" if not "%RC%"=="2359302" (
    echo GRESKA: WMF 5.1 ^(wusa^) vratio kod %RC%.
    goto fail
)
echo       OK

:agent
rem ---------- Netdesk Agent + Manager ----------
echo [3/3] Instalacija Netdesk Agent + Manager...
if not exist "NetdeskAgentSetup.exe" (
    echo GRESKA: NetdeskAgentSetup.exe nije u ovom folderu.
    goto fail
)
NetdeskAgentSetup.exe /quiet
if errorlevel 1 (
    echo.
    if "%REBOOT%"=="1" (
        echo Agent setup nije uspeo - verovatno zato sto .NET ceka restart.
        echo Restartuj racunar pa pokreni Install.cmd ponovo.
    ) else (
        echo GRESKA: Agent setup nije uspeo, detalji u %LOG%
    )
    goto fail
)

rem Windows 7: the TLS 1.2 registry fix only takes effect after a reboot.
if "%WIN7%"=="1" set REBOOT=1

echo.
echo === Gotovo.
if "%REBOOT%"=="0" goto done
if /i "%~1"=="/reboot" (
    echo Racunar se restartuje za 30 sekundi ^(shutdown /a za otkazivanje^).
    shutdown /r /t 30 /c "Netdesk Agent instalacija - restart"
    goto done
)
echo POTREBAN RESTART racunara - agent se do tada ne moze povezati na server.
goto done

:not_admin
echo Potrebna su administratorska prava: desni klik na Install.cmd - Run as administrator.
goto fail

:missing_net
echo GRESKA: nedostaje NDP48-x86-x64-AllOS-ENU.exe u ovom folderu.
goto fail

:missing_msu
echo GRESKA: nedostaje %MSU% u ovom folderu.
goto fail

:fail
echo.
pause
exit /b 1

:done
echo.
if /i not "%~1"=="/reboot" pause
exit /b 0
