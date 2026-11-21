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
    /// Its own minimal HTTP client for EXACTLY one call (POST
    /// /api/agents/update/report) - a replacement for the shared NetdeskApiClient from
    /// Netdesk.Agent.Common. The Manager has no need for the whole API client
    /// (enroll/heartbeat/inventory/jobs/...), only for this one report-the-
    /// -result call after an install_files command.
    /// </summary>
    internal static class UpdateReportClient
    {
        // [JsonProperty] explicitly camelCase instead of a ContractResolver -
        // simpler for one small, fixed payload than introducing the whole
        // serializer-settings machinery just for this.
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
            // .NET Framework 4.5.2 (this project's net452 build) doesn't include
            // TLS 1.2 in the default ServicePointManager.SecurityProtocol
            // set - the same note/discovery as Netdesk.Agent.Common/Http/
            // NetdeskApiClient.cs, now duplicated here since the Manager no longer
            // references that file.
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
