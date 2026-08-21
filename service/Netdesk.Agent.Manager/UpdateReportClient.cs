using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstveni, minimalni HTTP klijent za TAČNO jedan poziv (POST
    /// /api/agents/update/report) - zamena za deljeni NetdeskApiClient iz
    /// Netdesk.Agent.Common. Manager nema potrebu za celim API klijentom
    /// (enroll/heartbeat/inventory/jobs/...), samo za ovaj jedan javljaj-
    /// -rezultat poziv posle install_files komande.
    /// </summary>
    internal static class UpdateReportClient
    {
        // [JsonProperty] eksplicitno camelCase umesto ContractResolver-a -
        // jednostavnije za jedan mali, fiksan payload nego uvoditi celu
        // serializer-podešavanja mašineriju samo za ovo.
        private class UpdateReportRequest
        {
            [JsonProperty("fromVersion")] public string FromVersion { get; set; }
            [JsonProperty("toVersion")] public string ToVersion { get; set; }
            [JsonProperty("success")] public bool Success { get; set; }
            [JsonProperty("reason")] public string Reason { get; set; }
        }

        public static async Task ReportAsync(
            string serverBaseUrl, string agentId, string apiKey,
            string fromVersion, string toVersion, bool success, string reason)
        {
            // .NET Framework 4.5.2 (net452 build ovog projekta) ne uključuje
            // TLS 1.2 u podrazumevanom ServicePointManager.SecurityProtocol
            // setu - ista napomena/otkriće kao Netdesk.Agent.Common/Http/
            // NetdeskApiClient.cs, sad duplirana ovde pošto Manager više ne
            // referencira taj fajl.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            var request = new UpdateReportRequest
            {
                FromVersion = fromVersion,
                ToVersion = toVersion,
                Success = success,
                Reason = reason,
            };
            var json = JsonConvert.SerializeObject(request);

            using (var http = new HttpClient { BaseAddress = new Uri(serverBaseUrl) })
            using (var req = new HttpRequestMessage(HttpMethod.Post, "/api/agents/update/report"))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", agentId + ":" + apiKey);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                using (var res = await http.SendAsync(req).ConfigureAwait(false))
                {
                    if (!res.IsSuccessStatusCode)
                    {
                        var body = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                        throw new InvalidOperationException(
                            "Update-report POST vratio " + (int)res.StatusCode + ": " + body);
                    }
                }
            }
        }
    }
}
