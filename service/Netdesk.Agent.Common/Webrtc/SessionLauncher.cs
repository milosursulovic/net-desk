using System;
using System.Runtime.InteropServices;

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
    ///      pogađa i capture, ne samo injection (ovo NIJE bilo eksplicitno
    ///      u originalnom planu - otkriveno tek pisanjem ovog fajla, vredi
    ///      zapisati kao ispravku plana).
    ///
    /// Rešenje (standardna tehnika za servise koji moraju da rade nešto u
    /// interaktivnoj sesiji - ista opšta ideja kao WTSSendMessage pristupi):
    /// servis dobije token PRIJAVLJENOG korisnika (WTSQueryUserToken), pa tim
    /// tokenom pokrene POSEBAN, mali helper proces (CreateProcessAsUser) KOJI
    /// SE IZVRŠAVA UNUTAR korisničke sesije - taj helper proces (ne sam
    /// servis) treba da radi i capture i encode i injection i samu SIPSorcery
    /// peer-konekciju (WebRtcSession.cs), komunicirajući sa glavnim servisom
    /// preko named pipe-a ili sličnog IPC-a za start/stop signalizaciju. Isti
    /// opšti oblik kao postojeći Netdesk.Agent.Manager splitting (poseban
    /// proces za posao koji glavni servis ne može sam da uradi), samo iz
    /// drugog razloga (session isolation, ne "ne može da prepiše sopstvene
    /// fajlove").
    ///
    /// NIJE RUNTIME TESTIRANO - nema Windows mašine/prijavljenog korisnika u
    /// ovoj sesiji da se ovo stvarno proveri. CreateProcessAsUser posebno ima
    /// poznate "radi na papiru, otkaže uživo" zamke (CreateEnvironmentBlock
    /// mora se pozvati sa istim tokenom PRE CreateProcessAsUser ili environment
    /// varijable helper procesa budu pogrešne; token mora imati
    /// SE_ASSIGNPRIMARYTOKEN_NAME i SE_INCREASE_QUOTA_NAME privilegije na
    /// LocalSystem nalogu servisa - obično već prisutne, ali NIJE potvrđeno
    /// uživo ovde).
    /// </summary>
    public static class SessionLauncher
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true)]
        private static extern bool WTSQueryUserToken(uint sessionId, out IntPtr phToken);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool DuplicateTokenEx(
            IntPtr hExistingToken,
            uint dwDesiredAccess,
            IntPtr lpTokenAttributes,
            int impersonationLevel,
            int tokenType,
            out IntPtr phNewToken);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

        [DllImport("userenv.dll", SetLastError = true)]
        private static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

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
        private static extern bool CreateProcessAsUser(
            IntPtr hToken,
            string lpApplicationName,
            string lpCommandLine,
            IntPtr lpProcessAttributes,
            IntPtr lpThreadAttributes,
            bool bInheritHandles,
            uint dwCreationFlags,
            IntPtr lpEnvironment,
            string lpCurrentDirectory,
            ref StartupInfo lpStartupInfo,
            out ProcessInformation lpProcessInformation);

        private const uint TOKEN_ALL_ACCESS = 0xF01FF;
        private const int SECURITY_IMPERSONATION = 2; // SecurityImpersonation
        private const int TOKEN_TYPE_PRIMARY = 1;      // TokenPrimary
        private const uint NORMAL_PRIORITY_CLASS = 0x00000020;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NO_WINDOW = 0x08000000;

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
            uint sessionId = WTSGetActiveConsoleSessionId();
            // 0xFFFFFFFF (uint.MaxValue) znači "nema aktivne konzolne sesije"
            // (npr. mašina je na login ekranu ili u pitanju je headless server).
            if (sessionId == uint.MaxValue) return 0;

            if (!WTSQueryUserToken(sessionId, out var userToken)) return 0;

            IntPtr primaryToken = IntPtr.Zero;
            IntPtr envBlock = IntPtr.Zero;
            try
            {
                if (!DuplicateTokenEx(
                        userToken, TOKEN_ALL_ACCESS, IntPtr.Zero,
                        SECURITY_IMPERSONATION, TOKEN_TYPE_PRIMARY, out primaryToken))
                {
                    return 0;
                }

                // MORA biti pozvano posle DuplicateTokenEx a pre
                // CreateProcessAsUser sa ISTIM tokenom - redosled je bitan
                // (dokumentovano Win32 ponašanje, ne proizvoljan izbor ovde).
                if (!CreateEnvironmentBlock(out envBlock, primaryToken, false))
                {
                    envBlock = IntPtr.Zero; // nastavi bez environment bloka ako ovo padne
                }

                var startupInfo = new StartupInfo { cb = Marshal.SizeOf(typeof(StartupInfo)) };
                // "winsta0\\default" - interaktivni window station + desktop
                // te sesije. Bez ovoga proces se pokreće na "besktop-less"
                // window station-u i SendInput/DXGI capture ne bi imali šta
                // da vide.
                startupInfo.lpDesktop = "winsta0\\default";

                var commandLine = "\"" + bridgeExePath + "\" " + arguments;
                var created = CreateProcessAsUser(
                    primaryToken,
                    null,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    NORMAL_PRIORITY_CLASS | CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                    envBlock,
                    null,
                    ref startupInfo,
                    out var processInfo);

                if (!created) return 0;

                CloseHandle(processInfo.hThread);
                CloseHandle(processInfo.hProcess);
                return processInfo.dwProcessId;
            }
            finally
            {
                if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
                if (primaryToken != IntPtr.Zero) CloseHandle(primaryToken);
                CloseHandle(userToken);
            }
        }
    }
}
