using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Vnc
{
    /// <summary>
    /// Netdesk.Agent.Service.exe radi kao LocalSystem, u Session 0 - Windows
    /// izoluje tu sesiju od prijavljenog korisnika (od Vista naovamo), pa
    /// Graphics.CopyFromScreen tamo baca "The handle is invalid" umesto da
    /// vrati stvarni desktop (potvrđeno uživo). Standardno rešenje za ovaj
    /// poznati Windows-service problem: servis pokrene poseban proces UNUTAR
    /// aktivne interaktivne korisničke sesije preko WTSQueryUserToken +
    /// CreateProcessAsUser (isti mehanizam kao "psexec -i"/RDP shadow alati),
    /// umesto da sam pokušava da hvata ekran. Taj proces
    /// (Netdesk.Agent.VncHelper.exe) samo poziva postojeći VncStreamer -
    /// capture/injection kod je nepromenjen, radi ispravno čim se izvršava
    /// iz procesa koji stvarno vidi korisnikov desktop.
    /// </summary>
    public static class VncHelperLauncher
    {
        [DllImport("kernel32.dll")]
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
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr hObject);

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
            ref STARTUPINFO lpStartupInfo,
            out PROCESS_INFORMATION lpProcessInformation);

        [StructLayout(LayoutKind.Sequential)]
        private struct STARTUPINFO
        {
            public int cb;
            public string lpReserved;
            public string lpDesktop;
            public string lpTitle;
            public int dwX;
            public int dwY;
            public int dwXSize;
            public int dwYSize;
            public int dwXCountChars;
            public int dwYCountChars;
            public int dwFillAttribute;
            public int dwFlags;
            public short wShowWindow;
            public short cbReserved2;
            public IntPtr lpReserved2;
            public IntPtr hStdInput;
            public IntPtr hStdOutput;
            public IntPtr hStdError;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_INFORMATION
        {
            public IntPtr hProcess;
            public IntPtr hThread;
            public int dwProcessId;
            public int dwThreadId;
        }

        private const int SecurityImpersonation = 2;
        private const int TokenPrimary = 1;
        private const uint TOKEN_ALL_ACCESS = 0xF01FF;
        private const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
        private const uint CREATE_NO_WINDOW = 0x08000000;
        private const uint NO_ACTIVE_SESSION = 0xFFFFFFFF;

        /// <summary>
        /// Pokreće Netdesk.Agent.VncHelper.exe (rodbrat Service.exe-a, isti
        /// Service\ folder - za razliku od Updater-a ne mora poseban folder
        /// jer ne prepisuje sopstvene fajlove dok radi) unutar aktivne
        /// interaktivne korisničke sesije. Best-effort: vraća false i loguje
        /// tačan razlog na svaki neuspeh (nema prijavljenog korisnika, token
        /// pozivi neuspešni, exe nije nađen...) - ovo se zove iz job-poll
        /// petlje i nikad ne sme da je obori.
        /// </summary>
        public static bool LaunchInUserSession(long sessionId, string serverBaseUrl, string agentId, string apiKey)
        {
            // Netdesk.Agent.VncHelper.exe radi kao obični interaktivni
            // korisnik, ne LocalSystem - a agent.log fajl je originalno
            // napravio LocalSystem (ovaj servis), sa ACL-om koji obično ne
            // dozvoljava pisanje običnim korisnicima. Bez ovoga, VncHelper
            // radi (ili ne radi) potpuno "u tami" - FileLogger.Write guta
            // grešku pisanja isto kao i svaku drugu, pa se ne vidi apsolutno
            // ništa u log fajlu bez obzira šta se stvarno dešava iznutra
            // (potvrđeno uživo). Ovaj servis (LocalSystem) ima prava da to
            // ispravi, VncHelper sam nema.
            EnsureLogDirWritableByInteractiveUsers();

            var consoleSessionId = WTSGetActiveConsoleSessionId();
            if (consoleSessionId == NO_ACTIVE_SESSION)
            {
                FileLogger.Error(
                    "VNC sesija #" + sessionId +
                    " - nema aktivne interaktivne korisničke sesije (niko nije prijavljen na konzoli).", null);
                return false;
            }

            var userToken = IntPtr.Zero;
            var dupToken = IntPtr.Zero;
            var envBlock = IntPtr.Zero;

            try
            {
                if (!WTSQueryUserToken(consoleSessionId, out userToken))
                {
                    FileLogger.Error(
                        "VNC sesija #" + sessionId + " - WTSQueryUserToken neuspešan (Win32 error " +
                        Marshal.GetLastWin32Error() + ").", null);
                    return false;
                }

                if (!DuplicateTokenEx(
                        userToken, TOKEN_ALL_ACCESS, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out dupToken))
                {
                    FileLogger.Error(
                        "VNC sesija #" + sessionId + " - DuplicateTokenEx neuspešan (Win32 error " +
                        Marshal.GetLastWin32Error() + ").", null);
                    return false;
                }

                // Best-effort - ako ne uspe, CreateProcessAsUser i dalje radi,
                // samo helper proces neće imati korisnikove env promenljive.
                CreateEnvironmentBlock(out envBlock, dupToken, false);

                var helperExePath = ResolveHelperExePath();
                if (string.IsNullOrEmpty(helperExePath) || !File.Exists(helperExePath))
                {
                    FileLogger.Error(
                        "VNC sesija #" + sessionId + " - Netdesk.Agent.VncHelper.exe nije pronađen na: " +
                        helperExePath, null);
                    return false;
                }

                var commandLine =
                    "\"" + helperExePath + "\"" +
                    " --session-id " + sessionId +
                    " --server-base-url \"" + serverBaseUrl + "\"" +
                    " --agent-id \"" + agentId + "\"" +
                    " --api-key \"" + apiKey + "\"";

                var startupInfo = new STARTUPINFO();
                startupInfo.cb = Marshal.SizeOf(typeof(STARTUPINFO));
                startupInfo.lpDesktop = "winsta0\\default";

                PROCESS_INFORMATION processInfo;
                var created = CreateProcessAsUser(
                    dupToken,
                    null,
                    commandLine,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    CREATE_UNICODE_ENVIRONMENT | CREATE_NO_WINDOW,
                    envBlock,
                    null,
                    ref startupInfo,
                    out processInfo);

                if (!created)
                {
                    FileLogger.Error(
                        "VNC sesija #" + sessionId + " - CreateProcessAsUser neuspešan (Win32 error " +
                        Marshal.GetLastWin32Error() + ").", null);
                    return false;
                }

                CloseHandle(processInfo.hProcess);
                CloseHandle(processInfo.hThread);

                FileLogger.Info(
                    "VNC sesija #" + sessionId + " - VncHelper pokrenut u korisničkoj sesiji #" + consoleSessionId + ".");
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("VNC sesija #" + sessionId + " - pokretanje VncHelper-a neuspešno", ex);
                return false;
            }
            finally
            {
                if (envBlock != IntPtr.Zero) DestroyEnvironmentBlock(envBlock);
                if (dupToken != IntPtr.Zero) CloseHandle(dupToken);
                if (userToken != IntPtr.Zero) CloseHandle(userToken);
            }
        }

        private static string ResolveHelperExePath()
        {
            var installDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            return installDir == null ? null : Path.Combine(installDir, "Netdesk.Agent.VncHelper.exe");
        }

        /// <summary>
        /// Best-effort - ako ovo ne uspe, VncHelper i dalje pokušava da radi,
        /// samo njegovo logovanje ostaje tiho (isti fallback kao svaka druga
        /// FileLogger greška). Idempotentno - bezbedno se poziva na svaki
        /// VNC start, ne samo jednom pri instalaciji.
        /// </summary>
        private static void EnsureLogDirWritableByInteractiveUsers()
        {
            try
            {
                var dir = Path.GetDirectoryName(Paths.LogFile);
                if (string.IsNullOrEmpty(dir)) return;
                Directory.CreateDirectory(dir);

                var dirInfo = new DirectoryInfo(dir);
                var security = dirInfo.GetAccessControl();
                var usersSid = new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid, null);
                var rule = new FileSystemAccessRule(
                    usersSid,
                    FileSystemRights.Modify | FileSystemRights.Synchronize,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None,
                    AccessControlType.Allow);

                security.AddAccessRule(rule);
                dirInfo.SetAccessControl(security);

                // Folder ACL sa nasleđivanjem važi samo za NOVE fajlove -
                // agent.log već postoji (Service.exe ga piše od pre ovog
                // fix-a) i zadržava svoj stari ACL dok se eksplicitno ne
                // promeni i na njemu direktno (potvrđeno uživo - folder-only
                // fix nije bio dovoljan).
                if (File.Exists(Paths.LogFile))
                {
                    var fileInfo = new FileInfo(Paths.LogFile);
                    var fileSecurity = fileInfo.GetAccessControl();
                    var fileRule = new FileSystemAccessRule(
                        usersSid,
                        FileSystemRights.Modify | FileSystemRights.Synchronize,
                        AccessControlType.Allow);
                    fileSecurity.AddAccessRule(fileRule);
                    fileInfo.SetAccessControl(fileSecurity);
                }
            }
            catch (Exception ex)
            {
                FileLogger.Error("Ne mogu da podesim dozvole na log folderu/fajlu za VncHelper", ex);
            }
        }
    }
}
