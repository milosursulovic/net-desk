using System;
using System.Collections.Generic;
using System.Threading;
using NetdeskAgent.Common.Configuration;
using NetdeskAgent.Common.Logging;
using NetdeskAgent.Common.Vnc;

namespace NetdeskAgent.VncHelper
{
    /// <summary>
    /// Pokreće se UNUTAR interaktivne korisničke sesije - servis (LocalSystem,
    /// Session 0) nas pokreće preko VncHelperLauncher.LaunchInUserSession jer
    /// sam servis ne vidi pravi desktop. Sav stvarni posao (capture/injection/
    /// streaming) je nepromenjen kod u VncStreamer - ovaj proces ga samo
    /// pokreće iz konteksta koji STVARNO ima pristup korisnikovom desktopu.
    /// Kratkotrajan proces: izlazi čim se VNC sesija završi (server, viewer,
    /// ili timeout je zatvore).
    /// </summary>
    internal static class Program
    {
        private static void Main(string[] args)
        {
            FileLogger.Initialize(Paths.LogFile);

            var opts = ParseArgs(args);
            string sessionIdStr, serverBaseUrl, agentId, apiKey;
            long sessionId;

            if (!opts.TryGetValue("session-id", out sessionIdStr) || !long.TryParse(sessionIdStr, out sessionId) ||
                !opts.TryGetValue("server-base-url", out serverBaseUrl) ||
                !opts.TryGetValue("agent-id", out agentId) ||
                !opts.TryGetValue("api-key", out apiKey))
            {
                FileLogger.Error("VncHelper - nedostaju ili su neispravni obavezni argumenti.", null);
                Environment.Exit(1);
                return;
            }

            try
            {
                VncStreamer.RunAsync(sessionId, serverBaseUrl, agentId, apiKey, CancellationToken.None)
                    .GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                FileLogger.Error("VncHelper - neočekivana greška u VNC sesiji #" + sessionId, ex);
            }
        }

        private static Dictionary<string, string> ParseArgs(string[] args)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var i = 0;

            while (i < args.Length)
            {
                if (args[i].StartsWith("--") && i + 1 < args.Length)
                {
                    result[args[i].Substring(2)] = args[i + 1];
                    i += 2;
                }
                else
                {
                    i++;
                }
            }

            return result;
        }
    }
}
