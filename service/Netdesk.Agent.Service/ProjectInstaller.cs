using System;
using System.Collections;
using System.ComponentModel;
using System.Configuration.Install;
using System.Diagnostics;
using System.Reflection;
using System.ServiceProcess;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;

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
        private const string FirewallRuleName = "NetdeskAgent-Outbound";

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
        /// Agent radi isključivo odlazne HTTPS pozive (heartbeat/inventory/jobs/
        /// event log/update) - nikad ne osluškuje na portu, pa Windows Firewall
        /// pod default podešavanjima (odlazno dozvoljeno) ne pravi problem -
        /// ovo je potvrđeno uživo na Win7/10/11 bez ijedne firewall izmene.
        /// Ovo pravilo je dodatno pojačanje za okruženja gde je GPO promenio
        /// podrazumevanu odlaznu politiku na "Block": bez eksplicitnog
        /// dozvoljavanja po tačnoj .exe putanji, agent bi u takvom okruženju
        /// tiho prestao da radi bez ijedne greške koja bi jasno ukazala na
        /// firewall kao uzrok (isti "tihi neuspeh" obrazac kao i metadata bug -
        /// videti windows-service memoriju).
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
                    "Dodavanje odlaznog firewall pravila nije uspelo - agent i dalje radi normalno pod " +
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
            // AgentWorker-a, pa FileLogger nikad nije inicijalizovan ovim putem -
            // bez ovoga bi Info/Warn pozivi ovde tiho ništa ne uradili.
            FileLogger.Initialize(Paths.LogFile);
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
