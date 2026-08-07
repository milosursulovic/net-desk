using System;
using System.Collections;
using System.ComponentModel;
using System.Configuration.Install;
using System.Diagnostics;
using System.Reflection;
using System.ServiceProcess;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Manager;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Omogućava instalaciju preko InstallUtil.exe:
    ///   InstallUtil.exe Netdesk.Agent.Manager.exe
    /// Servis se instalira pod LocalSystem nalogom, Automatic startup - isti
    /// obrazac kao Netdesk.Agent.Service/ProjectInstaller.cs.
    /// </summary>
    [RunInstaller(true)]
    public class ProjectInstaller : Installer
    {
        private const string FirewallRuleName = "NetdeskAgentManager-Outbound";

        public ProjectInstaller()
        {
            var processInstaller = new ServiceProcessInstaller
            {
                Account = ServiceAccount.LocalSystem,
            };

            var serviceInstaller = new ServiceInstaller
            {
                ServiceName = ManagerCommandClient.ManagerServiceName,
                DisplayName = "Netdesk Agent Manager",
                Description = "Pomoćni servis za bezbedan restart/ažuriranje Netdesk Agent servisa.",
                StartType = ServiceStartMode.Automatic,
            };

            Installers.Add(processInstaller);
            Installers.Add(serviceInstaller);
        }

        public override void Install(IDictionary savedState)
        {
            base.Install(savedState);
            AddOutboundFirewallRule();
        }

        public override void Uninstall(IDictionary savedState)
        {
            RemoveOutboundFirewallRule();
            base.Uninstall(savedState);
        }

        /// <summary>
        /// Manager pravi TAČNO jedan odlazni HTTPS poziv (javljanje rezultata
        /// update-a serveru, posle install_files komande) - redak put, ali
        /// pod restriktivnim GPO odlaznim politikama bi inače tiho otkazivao
        /// bez ijedne jasne greške (isti "tihi neuspeh" razlog kao NetdeskAgent-
        /// ov ekvivalentno pravilo).
        /// </summary>
        private void AddOutboundFirewallRule()
        {
            InitializeLogger();

            var exePath = Assembly.GetExecutingAssembly().Location;

            var ok = RunNetsh(
                "advfirewall firewall add rule name=\"" + FirewallRuleName + "\" " +
                "dir=out action=allow program=\"" + exePath + "\" enable=yes profile=any");

            if (ok)
            {
                FileLogger.Info("Odlazno firewall pravilo '" + FirewallRuleName + "' dodato za " + exePath);
            }
            else
            {
                FileLogger.Warn(
                    "Dodavanje odlaznog firewall pravila nije uspelo - Manager i dalje radi normalno pod " +
                    "default Windows Firewall podešavanjima (odlazno dozvoljeno), ali ako GPO restriktivno " +
                    "kontroliše odlazni saobraćaj, možda će biti potrebno ručno dozvoliti " + exePath + ".");
            }
        }

        private void RemoveOutboundFirewallRule()
        {
            InitializeLogger();
            RunNetsh("advfirewall firewall delete rule name=\"" + FirewallRuleName + "\"");
        }

        private static void InitializeLogger()
        {
            // ProjectInstaller radi unutar InstallUtil.exe procesa, ne unutar
            // ManagerWorker-a, pa FileLogger nikad nije inicijalizovan ovim
            // putem - bez ovoga bi Info/Warn pozivi ovde tiho ništa ne uradili.
            FileLogger.Initialize(Paths.ManagerLogFile);
        }

        private static bool RunNetsh(string arguments)
        {
            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "netsh.exe",
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };

                using (var process = Process.Start(psi))
                {
                    process.WaitForExit(10000);
                    return process.ExitCode == 0;
                }
            }
            catch (Exception ex)
            {
                FileLogger.Warn("netsh poziv neuspešan: " + ex.Message);
                return false;
            }
        }
    }
}
