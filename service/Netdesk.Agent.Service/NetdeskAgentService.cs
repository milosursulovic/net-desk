using System;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Service
{
    /// <summary>
    /// Windows Service omotač - sav stvaran rad je u AgentWorker-u tako da
    /// isti kod radi i pod ServiceBase i u konzolnom debug modu (Program.cs).
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

            // Task.Run umesto blokiranja OnStart-a - SCM očekuje brz povratak
            // iz OnStart, inače Windows javlja "servis se nije na vreme pokrenuo".
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
