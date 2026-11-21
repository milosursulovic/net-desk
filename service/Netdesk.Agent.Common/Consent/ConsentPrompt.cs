using System;
using System.Runtime.InteropServices;
using System.Text;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Consent
{
    /// <summary>
    /// Prozor za eksplicitni pristanak korisnika na radnoj stanici PRE
    /// preuzimanja ekrana (akt o bezbednosti informacionih sistema: zabrana
    /// samoinicijativnog preuzimanja ekrana). Servis radi kao LocalSystem u
    /// Session 0 i nema sopstveni desktop, pa se prozor ne sme praviti obicnim
    /// MessageBox-om (pojavio bi se na nevidljivom Session 0 desktopu). Umesto
    /// toga koristi se WTSSendMessageW, koji prikazuje modalni dijalog na
    /// desktopu AKTIVNE KONZOLNE sesije (prijavljeni lekar/sestra) i sinhrono
    /// vraca koje je dugme kliknuto - ciste Session 0 -> interaktivna sesija
    /// komunikacije, bez potrebe za zasebnim procesom u korisnickoj sesiji.
    ///
    /// Ime odobravaoca = korisnicko ime aktivne konzolne sesije
    /// (WTSQuerySessionInformation), bez kucanja - poklapa se sa zahtevom da
    /// "lekar ili sestra na radnoj stanici aktivno kliknu" na odobrenje.
    /// </summary>
    public static class ConsentPrompt
    {
        public struct Result
        {
            // "granted" | "denied" | "timeout" | "unavailable" - poklapa se sa
            // consent_status ENUM na backend-u (VncConsentSchema).
            public string ConsentStatus;
            public string ApproverUsername;
        }

        private const string Title = "Zahtev za udaljenu podršku";
        private const string Message =
            "IKT podrška želi da preuzme ekran ove radne stanice radi udaljene pomoći.\n\n" +
            "Preuzimanje ekrana je dozvoljeno ISKLJUČIVO uz vaš pristanak i trajno se " +
            "beleži (ko je inicirao, ko je odobrio, vreme, IP i MAC adrese).\n\n" +
            "Da li odobravate preuzimanje vašeg ekrana?";

        // MessageBox stilovi (Winuser.h). DEFBUTTON2 -> podrazumevano "Ne", da
        // slučajan Enter ne odobri sesiju. SYSTEMMODAL+TOPMOST+SETFOREGROUND ->
        // prozor iskače ispred svega i zahteva odgovor.
        private const uint MB_YESNO = 0x00000004;
        private const uint MB_ICONWARNING = 0x00000030;
        private const uint MB_DEFBUTTON2 = 0x00000100;
        private const uint MB_SYSTEMMODAL = 0x00001000;
        private const uint MB_SETFOREGROUND = 0x00010000;
        private const uint MB_TOPMOST = 0x00040000;

        private const int IDYES = 6;
        private const int IDNO = 7;
        private const int IDTIMEOUT = 32000;

        private const int WTSUserName = 5;
        private const int WTSDomainName = 7;

        private static readonly IntPtr WTS_CURRENT_SERVER_HANDLE = IntPtr.Zero;
        private const uint INVALID_SESSION = 0xFFFFFFFF;

        /// <param name="timeoutSeconds">Koliko dugo prozor čeka odgovor pre nego što se tretira kao "timeout".</param>
        public static Result Ask(int timeoutSeconds)
        {
            uint sessionId = WTSGetActiveConsoleSessionId();
            if (sessionId == INVALID_SESSION)
            {
                FileLogger.Warn("Pristanak za VNC: nema aktivne konzolne sesije - preuzimanje odbijeno.");
                return new Result { ConsentStatus = "unavailable", ApproverUsername = null };
            }

            string approver = BuildApproverName((int)sessionId);
            if (string.IsNullOrEmpty(approver))
            {
                // Aktivna konzolna sesija bez prijavljenog korisnika (npr. logon
                // ekran) - niko ne može da odobri, ne prikazuj prozor.
                FileLogger.Warn("Pristanak za VNC: nema prijavljenog korisnika na konzolnoj sesiji - preuzimanje odbijeno.");
                return new Result { ConsentStatus = "unavailable", ApproverUsername = null };
            }

            uint style = MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2 | MB_SYSTEMMODAL | MB_SETFOREGROUND | MB_TOPMOST;
            int response;
            bool ok = WTSSendMessageW(
                WTS_CURRENT_SERVER_HANDLE,
                (int)sessionId,
                Title, Encoding.Unicode.GetByteCount(Title),
                Message, Encoding.Unicode.GetByteCount(Message),
                style,
                timeoutSeconds,
                out response,
                true /* bWait - blokira dok korisnik ne odgovori ili ne istekne timeout */);

            if (!ok)
            {
                int err = Marshal.GetLastWin32Error();
                FileLogger.Error("Pristanak za VNC: WTSSendMessageW neuspešan (Win32 greška " + err + ") - preuzimanje odbijeno.");
                return new Result { ConsentStatus = "unavailable", ApproverUsername = approver };
            }

            switch (response)
            {
                case IDYES:
                    FileLogger.Info("Pristanak za VNC ODOBRIO korisnik: " + approver);
                    return new Result { ConsentStatus = "granted", ApproverUsername = approver };
                case IDNO:
                    FileLogger.Info("Pristanak za VNC ODBIO korisnik: " + approver);
                    return new Result { ConsentStatus = "denied", ApproverUsername = approver };
                case IDTIMEOUT:
                default:
                    FileLogger.Info("Pristanak za VNC istekao bez odgovora (korisnik: " + approver + ").");
                    return new Result { ConsentStatus = "timeout", ApproverUsername = approver };
            }
        }

        private static string BuildApproverName(int sessionId)
        {
            string user = QuerySessionString(sessionId, WTSUserName);
            if (string.IsNullOrEmpty(user)) return null;
            string domain = QuerySessionString(sessionId, WTSDomainName);
            return string.IsNullOrEmpty(domain) ? user : domain + "\\" + user;
        }

        private static string QuerySessionString(int sessionId, int infoClass)
        {
            IntPtr buffer;
            uint bytes;
            if (!WTSQuerySessionInformationW(WTS_CURRENT_SERVER_HANDLE, sessionId, infoClass, out buffer, out bytes))
            {
                return null;
            }
            try
            {
                return Marshal.PtrToStringUni(buffer);
            }
            finally
            {
                WTSFreeMemory(buffer);
            }
        }

        [DllImport("kernel32.dll")]
        private static extern uint WTSGetActiveConsoleSessionId();

        [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool WTSSendMessageW(
            IntPtr hServer,
            int SessionId,
            string pTitle,
            int TitleLength,
            string pMessage,
            int MessageLength,
            uint Style,
            int Timeout,
            out int pResponse,
            bool bWait);

        [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool WTSQuerySessionInformationW(
            IntPtr hServer,
            int sessionId,
            int wtsInfoClass,
            out IntPtr ppBuffer,
            out uint pBytesReturned);

        [DllImport("wtsapi32.dll")]
        private static extern void WTSFreeMemory(IntPtr pMemory);
    }
}
