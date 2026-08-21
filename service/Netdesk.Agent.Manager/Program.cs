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
        /// Pokreće istu radnu petlju direktno u konzoli, bez SCM-a - za razvoj
        /// i debug bez instaliranja pravog Windows servisa. Koristiti:
        ///   Netdesk.Agent.Manager.exe --console
        /// Napomena: u konzolnom modu OnCustomCommand (SCM-only) ne postoji -
        /// mailbox se ovde proverava isključivo na periodičan tick.
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
