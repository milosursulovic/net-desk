using System;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Windows Service omotač - sav stvaran rad je u ManagerWorker-u tako da
    /// isti kod radi i pod ServiceBase i u konzolnom debug modu (Program.cs).
    /// </summary>
    public class NetdeskAgentManagerService : ServiceBase
    {
        private CancellationTokenSource _cts;
        private ManagerWorker _worker;
        private Task _runTask;

        public NetdeskAgentManagerService()
        {
            ServiceName = ManagerServiceInfo.ServiceName;
            CanStop = true;
            CanPauseAndContinue = false;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            _cts = new CancellationTokenSource();
            _worker = new ManagerWorker();

            // Task.Run umesto blokiranja OnStart-a - SCM očekuje brz povratak
            // iz OnStart, inače Windows javlja "servis se nije na vreme pokrenuo".
            _runTask = Task.Run(() => _worker.RunAsync(_cts.Token));
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

        /// <summary>
        /// Mora BRZO da vrati kontrolu SCM-u - samo signalizira event koji
        /// ManagerWorker čeka, ne sme sinhrono da izvrši stop/copy/start ovde
        /// (isti razlog kao "OnStart mora brzo da vrati" iznad).
        /// </summary>
        protected override void OnCustomCommand(int command)
        {
            if (command == ManagerServiceInfo.CustomCommandCode)
            {
                _worker?.WakeEvent.Set();
            }
        }
    }
}
