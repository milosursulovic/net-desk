using System;
using System.Collections;
using System.ComponentModel;
using System.Configuration.Install;
using System.Diagnostics;
using System.Reflection;
using System.ServiceProcess;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Enables installation via InstallUtil.exe:
    ///   InstallUtil.exe Netdesk.Agent.Manager.exe
    /// The service is installed under the LocalSystem account, Automatic startup - the same
    /// pattern as Netdesk.Agent.Service/ProjectInstaller.cs.
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
                ServiceName = ManagerServiceInfo.ServiceName,
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
        /// The Manager makes EXACTLY one outbound HTTPS call (reporting the update
        /// result to the server, after an install_files command) - a rare path, but
        /// under restrictive GPO outbound policies it would otherwise fail silently
        /// without a single clear error (the same "silent failure" reason as
        /// NetdeskAgent's equivalent rule).
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
            // ProjectInstaller runs inside the InstallUtil.exe process, not inside
            // ManagerWorker, so FileLogger is never initialized along this
            // path - without this, the Info/Warn calls here would silently do nothing.
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
