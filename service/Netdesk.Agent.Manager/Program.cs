using System;
using System.ServiceProcess;
using System.Threading;

namespace NetdeskAgent.Manager
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            FileLogger.Initialize(Paths.ManagerLogFile);

            var consoleMode = Environment.UserInteractive || Array.IndexOf(args, "--console") >= 0;

            if (consoleMode)
            {
                RunConsole();
            }
            else
            {
                ServiceBase.Run(new NetdeskAgentManagerService());
            }
        }

        /// <summary>
        /// Runs the same work loop directly in the console, without the SCM - for development
        /// and debugging without installing a real Windows service. Usage:
        ///   Netdesk.Agent.Manager.exe --console
        /// Note: in console mode OnCustomCommand (SCM-only) doesn't exist -
        /// the mailbox is checked here exclusively on the periodic tick.
        /// </summary>
        private static void RunConsole()
        {
            Console.WriteLine("Netdesk Agent Manager - konzolni mod (Ctrl+C za izlaz)");

            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };

            var worker = new ManagerWorker();
            worker.RunAsync(cts.Token).GetAwaiter().GetResult();
        }
    }
}
