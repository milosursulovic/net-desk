using System;
using System.ServiceProcess;
using System.Threading;
using System.Threading.Tasks;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Windows Service wrapper - all the real work is in ManagerWorker so that
    /// the same code runs both under ServiceBase and in console debug mode (Program.cs).
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

            // Task.Run instead of blocking OnStart - the SCM expects a quick return
            // from OnStart, otherwise Windows reports "the service did not start in a timely fashion".
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
        /// Must return control to the SCM QUICKLY - it only signals the event
        /// ManagerWorker is waiting on, it must not synchronously perform stop/copy/start here
        /// (the same reason as "OnStart must return quickly" above).
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
