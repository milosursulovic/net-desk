namespace NetdeskAgent.Common.Webrtc
{
    /// <summary>
    /// "Mailbox" poruka od Netdesk.Agent.Service.exe ka već-pokrenutom
    /// Netdesk.Agent.WebRtcBridge.exe helper procesu - "pokreni novu WebRTC
    /// sesiju sad". Serijalizovana kao JSON u Paths.WebRtcBridgeCommandFile,
    /// isti plain-PascalCase obrazac kao ManagerCommand.cs (nikad ne prelazi
    /// HTTP granicu ka Node backend-u).
    ///
    /// Nosi SVE podatke potrebne za sesiju (ServerBaseUrl/AgentId/ApiKey), ne
    /// samo SessionId - iako Service i helper dele istu mašinu, helper sad
    /// radi kao genuinski ulogovani korisnik (Scheduled Task "at logon"), a
    /// %ProgramData%\NetdeskAgent (Paths.DataDir, gde žive config.json/
    /// state.json sa ApiKey-om) je namerno čitljiv samo pod LocalSystem/
    /// Administrators - helper NE SME sam da ih čita. Service (LocalSystem)
    /// već ima sve ove vrednosti učitane za svaki job, pa ih prosto prosleđuje
    /// kroz mailbox. Mailbox fajl se briše ODMAH po čitanju (isti
    /// delete-before-execute obrazac kao ManagerWorker.Dequeue), pa ApiKey ne
    /// ostaje na disku - ovo je i STROŽE od starog pristupa (argv na komandnoj
    /// liniji ostaje vidljiv u Task Manager-u/WMI-ju za celo trajanje sesije).
    /// </summary>
    public class WebRtcBridgeCommand
    {
        public string CommandId { get; set; }
        public string IssuedAtUtc { get; set; }
        public string ServerBaseUrl { get; set; }
        public string SessionId { get; set; }
        public string AgentId { get; set; }
        public string ApiKey { get; set; }
    }
}
