using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// NAJRIZIČNIJI DEO CELE WEBRTC IMPLEMENTACIJE - vidi napomenu na vrhu
    /// plana. Netdesk.Agent.Service radi kao Windows servis pod LocalSystem
    /// nalogom, u Session 0 - odsečen od interaktivne korisničke sesije od
    /// Windows Vista nadalje (Session 0 isolation). To znači DVE stvari koje
    /// UltraVNC danas radi "besplatno" (van naše kontrole, iz svog sopstvenog
    /// procesa koji NIJE ovaj servis) sada postaju NAŠ problem:
    ///   1. SendInput() pozvan iz Session 0 procesa ne stiže nigde - nema
    ///      desktop-a na koji bi se primenio.
    ///   2. DXGI Desktop Duplication (ScreenCapture.cs) TAKOĐE zahteva
    ///      interaktivnu desktop sesiju - ista Session 0 barijera verovatno
    ///      pogađa i capture, ne samo injection.
    ///
    /// UŽIVO POTVRĐENO 2026-08-24 (Process Monitor, više krugova): ručno
    /// sastavljen WTSQueryUserToken → DuplicateTokenEx → LoadUserProfile →
    /// CreateEnvironmentBlock → CreateProcessAsUser lanac je REDOVNO
    /// proizvodio proces sa validnim PID-om koji je zatim padao unutar
    /// sopstvene .NET CLR inicijalizacije (exit code 0x8007045A =
    /// ERROR_DLL_INIT_FAILED, dosledno na istom mestu, bez ijednog ACCESS
    /// DENIED reda u celom Procmon capture-u) - ni SeTcbPrivilege/
    /// SeAssignPrimaryTokenPrivilege/SeIncreaseQuotaPrivilege uključivanje,
    /// ni eksplicitna dodela pristupa na winsta0\default preko
    /// GetSecurityInfo/SetSecurityInfo, ni prelazak na WinExe (bez konzole)
    /// nisu promenili ishod ni za dlaku - isti exit code, isto mesto pada,
    /// svaki put. PsExec (`psexec -s -i <session>`) sa ISTIM ciljnim .exe-om
    /// i ISTIM (lažnim) argumentima je USPEO (čist exit code 1 - kontrolisan
    /// neuspeh konekcije na lažan URL, identično ručnom pokretanju) - dokaz
    /// da mašina/okruženje NIJE problem, već konkretno naš ručni
    /// CreateProcessAsUser lanac. PsExec interno koristi CreateProcessWithTokenW
    /// (viša Win32 funkcija, namenski građena za "pokreni ovaj token u
    /// TRENUTNOJ desktop sesiji") umesto ručnog sastavljanja - ta funkcija
    /// sama rešava profil/environment/desktop internO, pa je ceo ovaj fajl
    /// sad svedan na nju umesto na ručnu rekonstrukciju istog posla.
    /// Zahteva SeImpersonatePrivilege na pozivajućem (servisnom) nalogu -
    /// EnablePrivilege ispod je eksplicitno uključuje.
    /// </summary>
    public static class SessionLauncher
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out Luid lpLuid);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool AdjustTokenPrivileges(
            IntPtr tokenHandle,
            bool disableAllPrivileges,
            ref TokenPrivileges newState,
            uint bufferLength,
            IntPtr previousState,
            IntPtr returnLength);

        [StructLayout(LayoutKind.Sequential)]
        private struct Luid
        {
            public uint LowPart;
            public int HighPart;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TokenPrivileges
        {
            public uint PrivilegeCount;
            public Luid Luid;
            public uint Attributes;
        }

        private const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
        private const uint TOKEN_QUERY = 0x0008;
        private const uint SE_PRIVILEGE_ENABLED = 0x00000002;

        [StructLayout(LayoutKind.Sequential)]
        private struct StartupInfo
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
            public short wShowWindow, cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput, hStdOutput, hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcessInformation
        {
            public IntPtr hProcess, hThread;
            public uint dwProcessId, dwThreadId;
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool CreateProcessWithTokenW(
            IntPtr hToken,
            uint dwLogonFlags,
            string lpApplicationName,
            string lpCommandLine,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref StartupInfo lpStartupInfo,
            out ProcessInformation lpProcessInformation);

        private const uint LOGON_WITH_PROFILE = 0x00000001;
        private const uint NORMAL_PRIORITY_CLASS = 0x00000020;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NO_WINDOW = 0x08000000;

        // SeImpersonatePrivilege mora biti UKLJUČENA (ne samo prisutna) na OVOM
        // (pozivajućem, LocalSystem servisnom) procesu pre CreateProcessWithTokenW -
        // LocalSystem nalog je ima, ali privilegije na Windows tokenu imaju
        // odvojeno "prisutno" i "uključeno" stanje, i obična Windows servis
        // instanca ih ne uključuje automatski. Best-effort - ako ne uspe da se
        // uključi, samo se loguje upozorenje i nastavlja se dalje.
        private static void EnablePrivilege(string privilegeName)
        {
            IntPtr processToken = IntPtr.Zero;
            try
            {
                if (!OpenProcessToken(Process.GetCurrentProcess().Handle, TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, out processToken))
                {
                    FileLogger.Warn("OpenProcessToken (sopstveni proces) neuspešan pre uključivanja '" + privilegeName + "' (Win32 error " + Marshal.GetLastWin32Error() + ").");
                    return;
                }

                if (!LookupPrivilegeValue(null, privilegeName, out var luid))
                {
                    FileLogger.Warn("LookupPrivilegeValue('" + privilegeName + "') neuspešan (Win32 error " + Marshal.GetLastWin32Error() + ").");
                    return;
                }

                var tp = new TokenPrivileges
                {
                    PrivilegeCount = 1,
                    Luid = luid,
                    Attributes = SE_PRIVILEGE_ENABLED,
                };

                var adjusted = AdjustTokenPrivileges(processToken, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
                var lastError = Marshal.GetLastWin32Error();
                if (!adjusted || lastError != 0)
                {
                    FileLogger.Warn("AdjustTokenPrivileges('" + privilegeName + "') neuspešan (Win32 error " + lastError + ") - privilegija verovatno nije dostupna na ovom nalogu.");
                }
            }
            finally
            {
                if (processToken != IntPtr.Zero) CloseHandle(processToken);
            }
        }

        /// <summary>
        /// Pokreće helper .exe (bridgeExePath) UNUTAR trenutno aktivne
        /// interaktivne konzolne sesije (WTSGetActiveConsoleSessionId - ne
        /// radi za RDP sesije koje nisu konzola, samo za "fizičku"/glavnu
        /// konzolnu sesiju; višekorisnički RDS scenario na winsrv bi
        /// zahtevao enumeraciju SVIH aktivnih sesija preko WTSEnumerateSessions
        /// umesto ovog jednostavnijeg poziva - namerno pojednostavljeno za
        /// prvi prolaz, flagovano kao poznato ograničenje).
        /// Vraća PID pokrenutog procesa, ili 0 ako trenutno nema prijavljenog
        /// korisnika u toj sesiji (WTSQueryUserToken vraća false na
        /// zaključanoj/odjavljenoj konzoli - očekivano stanje, ne greška
        /// koju treba logovati kao fatalnu).
        /// </summary>
        public static uint LaunchInActiveSession(string bridgeExePath, string arguments)
        {
            EnablePrivilege("SeImpersonatePrivilege");

            uint sessionId = WTSGetActiveConsoleSessionId();
            // 0xFFFFFFFF (uint.MaxValue) znači "nema aktivne konzolne sesije"
            // (npr. mašina je na login ekranu ili u pitanju je headless server).
            if (sessionId == uint.MaxValue) return 0;

            if (!WTSQueryUserToken(sessionId, out var userToken))
            {
                FileLogger.Warn("WTSQueryUserToken neuspešan za session #" + sessionId + " (Win32 error " + Marshal.GetLastWin32Error() + ").");
                return 0;
            }

            try
            {
                var startupInfo = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)) };
                // "winsta0\\default" - interaktivni window station + desktop
                // te sesije. Bez ovoga proces se pokreće na "desktop-less"
                // window station-u i SendInput/DXGI capture ne bi imali šta
                // da vide.
                startupInfo.lpDesktop = "winsta0\\default";

                var commandLine = "\"" + bridgeExePath + "\" " + arguments;
                // LOGON_WITH_PROFILE - CreateProcessWithTokenW sam učitava
                // korisnički profil i gradi environment blok od njega (otud
                // lpEnvironment=IntPtr.Zero ovde) - zamenjuje ceo ručni
                // LoadUserProfile/CreateEnvironmentBlock par koji smo ranije
                // sami sastavljali.
                var created = CreateProcessWithTokenW(
                    userToken,
                    LOGON_WITH_PROFILE,
                    null,
                    commandLine,
                    NORMAL_PRIORITY_CLASS | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                    IntPtr.Zero,
                    null,
                    ref startupInfo,
                    out var processInfo);

                if (!created)
                {
                    FileLogger.Warn("CreateProcessWithTokenW neuspešan (Win32 error " + Marshal.GetLastWin32Error() + ").");
                    return 0;
                }

                CloseHandle(processInfo.hThread);
                CloseHandle(processInfo.hProcess);
                return processInfo.dwProcessId;
            }
            finally
            {
                CloseHandle(userToken);
            }
        }
    }
}
