using System;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Service
{
    /// <summary>
    /// Windows Service wrapper - all the real work is in AgentWorker so that
    /// the same code runs both under ServiceBase and in console debug mode (Program.cs).
    /// </summary>
    public partial class NetdeskAgentService : ServiceBase
    {
        private CancellationTokenSource _cts;
        private Task _runTask;

        public NetdeskAgentService()
        {
            ServiceName = "NetdeskAgent";
            CanStop = true;
            CanPauseAndContinue = false;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _cts = new CancellationTokenSource();
            var worker = new AgentWorker();

            // Task.Run instead of blocking OnStart - the SCM expects a quick return
            // from OnStart, otherwise Windows reports "the service did not start in a timely fashion".
            _runTask = Task.Run(() => worker.RunAsync(_cts.Token));
        }

        protected override void OnStop()
        {
            _cts?.Cancel();

            try
            {
                _runTask?.Wait(TimeSpan.FromSeconds(10));
            }
            catch (AggregateException ex)
            {
                FileLogger.Error("Greška pri gašenju radne petlje", ex);
            }
        }
    }
}
