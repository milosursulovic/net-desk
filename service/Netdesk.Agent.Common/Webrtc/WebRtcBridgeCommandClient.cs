using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using Newtonsoft.Json;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// Pošiljalac strane mailbox protokola (Service ka WebRtcBridge helper-u) -
    /// piše WebRtcBridgeCommand u Paths.WebRtcBridgeCommandFile. Za razliku od
    /// ManagerCommandClient, cilj NIJE Windows servis (WebRtcBridge.exe je
    /// Scheduled Task proces, ne ServiceController-kontrolabilan) - nema
    /// custom-command "budi se" signal, samo fajl. Primalac (helper) drži
    /// FileSystemWatcher + periodični poll na istom folderu (vidi
    /// Netdesk.Agent.WebRtcBridge/Program.cs), pa kašnjenje budi/poll ciklusa
    /// ostaje ispod sekunde u praksi.
    /// </summary>
    public static class WebRtcBridgeCommandClient
    {
        /// <summary>
        /// Piše komandu u mailbox (atomic rename, isti obrazac kao
        /// ManagerCommandClient.TrySend). Vraća false samo ako sam upis nije
        /// uspeo - da li će neki WebRtcBridge helper stvarno pokupiti i
        /// obraditi komandu (npr. ako trenutno niko nije ulogovan na konzoli)
        /// se ne proverava ovde; postojeći signaling-nivo fallback (agent
        /// nikad ne otvori WS konekciju -> vncSessions.service.js prebacuje
        /// na RFB) je već dovoljna bezbednosna mreža za taj slučaj, ista kao
        /// pre ove izmene.
        /// </summary>
        public static bool TrySend(string serverBaseUrl, string sessionId, string agentId, string apiKey)
        {
            var command = new WebRtcBridgeCommand
            {
                CommandId = Guid.NewGuid().ToString("N"),
                IssuedAtUtc = DateTime.UtcNow.ToString("o"),
                ServerBaseUrl = serverBaseUrl,
                SessionId = sessionId,
                AgentId = agentId,
                ApiKey = apiKey,
            };

            var finalPath = Paths.WebRtcBridgeCommandFile;
            var tmpPath = finalPath + ".tmp";

            try
            {
                EnsureMailboxDirectory();

                var json = JsonConvert.SerializeObject(command, Formatting.Indented);
                File.WriteAllText(tmpPath, json);

                if (File.Exists(finalPath))
                {
                    File.Delete(finalPath);
                }
                File.Move(tmpPath, finalPath);
                return true;
            }
            catch (Exception ex)
            {
                FileLogger.Error("Upis WebRtcBridgeCommand mailbox fajla nije uspeo", ex);
                return false;
            }
        }

        /// <summary>
        /// Kreira Paths.WebRtcMailboxDir ako ne postoji i eksplicitno dodaje
        /// Modify pravo za "Authenticated Users" - default NTFS nasleđivanje
        /// bi ovaj poddirektorijum inače ostavilo na istoj (LocalSystem/
        /// Administrators-only) ACL kao roditeljski %ProgramData%\NetdeskAgent
        /// folder (vidi Paths.cs napomenu), a WebRtcBridge.exe sad radi kao
        /// obican ulogovan korisnik, bez admin prava. Poziva se pri SVAKOM
        /// TrySend-u (jeftino, idempotentno) umesto samo pri instalaciji - tako
        /// se folder/ACL sam "iscelu" i posle običnog binary-update-a servisa,
        /// bez potrebe da se instalacioni skript ponovo ručno pokrene.
        /// </summary>
        private static void EnsureMailboxDirectory()
        {
            var dir = Paths.WebRtcMailboxDir;
            Directory.CreateDirectory(dir);

            try
            {
                var security = new DirectorySecurity(dir, AccessControlSections.Access);
                var authenticatedUsers = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
                security.AddAccessRule(new FileSystemAccessRule(
                    authenticatedUsers,
                    FileSystemRights.Modify | FileSystemRights.Synchronize,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                    PropagationFlags.None,
                    AccessControlType.Allow));
                new DirectoryInfo(dir).SetAccessControl(security);
            }
            catch (Exception ex)
            {
                // Best-effort - ako ACL podešavanje padne (npr. već postoji i
                // nešto neočekivano drži handle), i dalje pokušaj upis; ako
                // folder već ima ispravnu ACL od ranije, ovo je no-op svejedno.
                FileLogger.Warn("Podešavanje ACL-a na " + dir + " nije uspelo: " + ex.Message);
            }
        }
    }
}
