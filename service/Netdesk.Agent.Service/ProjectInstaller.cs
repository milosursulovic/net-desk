using System.ComponentModel;
using System.Configuration.Install;
using System.ServiceProcess;

namespace NetdeskAgent.Service
{
    /// <summary>
    /// Omogućava instalaciju preko InstallUtil.exe:
    ///   InstallUtil.exe Netdesk.Agent.Service.exe
    /// Servis se instalira pod LocalSystem nalogom, Automatic startup - u skladu
    /// sa zahtevima 11.1 iz specifikacije (rad bez prijavljenog korisnika,
    /// automatski restart konfiguriše se posebno preko Recovery tab-a / sc.exe,
    /// InstallUtil to ne pokriva).
    /// </summary>
    [RunInstaller(true)]
    public class ProjectInstaller : Installer
    {
        public ProjectInstaller()
        {
            var processInstaller = new ServiceProcessInstaller
            {
                Account = ServiceAccount.LocalSystem,
            };

            var serviceInstaller = new ServiceInstaller
            {
                ServiceName = "NetdeskAgent",
                DisplayName = "Netdesk Agent",
                Description = "Centralizovani monitoring, inventar i udaljeno upravljanje računarom (Netdesk RMM).",
                StartType = ServiceStartMode.Automatic,
            };

            Installers.Add(processInstaller);
            Installers.Add(serviceInstaller);
        }
    }
}
