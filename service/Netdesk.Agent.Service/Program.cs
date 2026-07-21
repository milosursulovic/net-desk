using System;
using System.ServiceProcess;
using System.Threading;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Service
{
    internal static class Program
    {
        private static void Main(string[] args)
        {
            FileLogger.Initialize(Paths.LogFile);

            var consoleMode = Environment.UserInteractive || Array.IndexOf(args, "--console") >= 0;

            if (consoleMode)
            {
                RunConsole();
            }
            else
            {
                ServiceBase.Run(new NetdeskAgentService());
            }
        }

        /// <summary>
        /// Pokreće istu radnu petlju direktno u konzoli, bez SCM-a - za razvoj
        /// i debug bez instaliranja pravog Windows servisa. Koristiti:
        ///   Netdesk.Agent.Service.exe --console
        /// </summary>
        private static void RunConsole()
        {
            Console.WriteLine("Netdesk Agent - konzolni mod (Ctrl+C za izlaz)");

            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };

            var worker = new AgentWorker();
            worker.RunAsync(cts.Token).GetAwaiter().GetResult();
        }
    }
}
