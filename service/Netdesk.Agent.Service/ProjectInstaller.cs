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
    /// Enables installation via InstallUtil.exe:
    ///   InstallUtil.exe Netdesk.Agent.Service.exe
    /// The service is installed under the LocalSystem account, Automatic startup - in line
    /// with requirement 11.1 of the specification (running without a signed-in user;
    /// automatic restart is configured separately via the Recovery tab / sc.exe,
    /// InstallUtil doesn't cover that).
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
        /// The agent makes only outbound HTTPS calls (heartbeat/inventory/jobs/
        /// event log/update) - it never listens on a port, so Windows Firewall
        /// with default settings (outbound allowed) isn't a problem -
        /// this was confirmed live on Win7/10/11 without a single firewall change.
        /// This rule is an extra hardening for environments where a GPO has changed
        /// the default outbound policy to "Block": without explicitly
        /// allowing the exact .exe path, the agent would in such an environment
        /// silently stop working without a single error that would clearly point to
        /// the firewall as the cause (the same "silent failure" pattern as the metadata bug -
        /// see the windows-service memory).
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
            // ProjectInstaller runs inside the InstallUtil.exe process, not inside
            // AgentWorker, so FileLogger is never initialized along this path -
            // without this, the Info/Warn calls here would silently do nothing.
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
