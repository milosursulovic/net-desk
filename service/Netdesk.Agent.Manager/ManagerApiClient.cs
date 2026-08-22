using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json.Serialization;

namespace NetdeskAgent.Manager
{
    /// <summary>
    /// Sopstveni, minimalni HTTP klijent za Manager-ov NOVI, nezavisni kanal
    /// (/api/managers/*) - isti duh kao UpdateReportClient.cs (jedan mali
    /// fajl umesto celog deljenog NetdeskApiClient-a iz Common-a), samo sa
    /// par poziva više (enroll/heartbeat/poll/rezultat/download). Namerno
    /// baca običan InvalidOperationException na HTTP grešku (ne uvodi novi
    /// izuzetak tip samo za ovo, isti izbor kao UpdateReportClient.cs).
    /// </summary>
    internal class ManagerApiClient : IDisposable
    {
        private readonly HttpClient _http;

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        public class EnrollResponse
        {
            public string ManagerId { get; set; }
            public string ApiKey { get; set; }
        }

        public class ManagerJobItem
        {
            public long Id { get; set; }
            public string CommandType { get; set; }
            public JObject Payload { get; set; }
            public string Status { get; set; }
        }

        public class ManagerJobsResponse
        {
            public List<ManagerJobItem> Jobs { get; set; }
        }

        public class ManagerJobResultRequest
        {
            public int? ExitCode { get; set; }
            public string Output { get; set; }
            public string ErrorOutput { get; set; }
            public long? DurationMs { get; set; }
            public bool? Success { get; set; }
        }

        private class EnrollRequest
        {
            public string Hostname { get; set; }
            public string ManagerVersion { get; set; }
            public string Ip { get; set; }
        }

        private class HeartbeatRequest
        {
            public string Hostname { get; set; }
            public string ManagerVersion { get; set; }
            public string NetdeskAgentServiceStatus { get; set; }
            public string NetdeskAgentStartMode { get; set; }
        }

        public ManagerApiClient(string baseUrl)
        {
            // Isti razlog kao UpdateReportClient.cs/Common's NetdeskApiClient -
            // net452 ne uključuje TLS 1.2 u podrazumevanom setu.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            _http = new HttpClient { BaseAddress = new Uri(baseUrl) };
            _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public Task<EnrollResponse> EnrollAsync(string enrollToken, string hostname, string managerVersion, string ip)
        {
            var request = new EnrollRequest { Hostname = hostname, ManagerVersion = managerVersion, Ip = ip };
            return PostAsync<EnrollResponse>("/api/managers/enroll", enrollToken, request);
        }

        public Task HeartbeatAsync(
            string managerId, string apiKey, string hostname, string managerVersion,
            string netdeskAgentServiceStatus, string netdeskAgentStartMode)
        {
            var request = new HeartbeatRequest
            {
                Hostname = hostname,
                ManagerVersion = managerVersion,
                NetdeskAgentServiceStatus = netdeskAgentServiceStatus,
                NetdeskAgentStartMode = netdeskAgentStartMode,
            };
            return PostAsync<object>("/api/managers/heartbeat", Bearer(managerId, apiKey), request);
        }

        public Task<ManagerJobsResponse> GetJobsAsync(string managerId, string apiKey)
        {
            return GetAsync<ManagerJobsResponse>("/api/managers/jobs", Bearer(managerId, apiKey));
        }

        public Task SubmitJobResultAsync(string managerId, string apiKey, long jobId, ManagerJobResultRequest request)
        {
            return PostAsync<object>("/api/managers/jobs/" + jobId + "/result", Bearer(managerId, apiKey), request);
        }

        public async Task DownloadUpdateFileAsync(string managerId, string apiKey, long releaseId, string destinationPath)
        {
            using (var req = new HttpRequestMessage(HttpMethod.Get, "/api/managers/update/download/" + releaseId))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Bearer(managerId, apiKey));

                using (var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                {
                    if (!res.IsSuccessStatusCode)
                    {
                        var errBody = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                        throw new InvalidOperationException(
                            "Preuzimanje update paketa vratilo " + (int)res.StatusCode + ": " + errBody);
                    }

                    var dir = Path.GetDirectoryName(destinationPath);
                    if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                    {
                        Directory.CreateDirectory(dir);
                    }

                    using (var httpStream = await res.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using (var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write))
                    {
                        await httpStream.CopyToAsync(fileStream).ConfigureAwait(false);
                    }
                }
            }
        }

        private static string Bearer(string managerId, string apiKey)
        {
            return managerId + ":" + apiKey;
        }

        private async Task<T> PostAsync<T>(string path, string bearerToken, object body)
        {
            var json = JsonConvert.SerializeObject(body, JsonSettings);

            using (var req = new HttpRequestMessage(HttpMethod.Post, path))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                using (var res = await _http.SendAsync(req).ConfigureAwait(false))
                {
                    var respBody = await res.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!res.IsSuccessStatusCode)
                    {
                        throw new InvalidOperationException(
                            path + " vratio " + (int)res.StatusCode + ": " + respBody);
                    }

                    return string.IsNullOrEmpty(respBody)
                        ? default(T)
                        : JsonConvert.DeserializeObject<T>(respBody, JsonSettings);
                }
            }
        }

        private async Task<T> GetAsync<T>(string path, string bearerToken)
        {
            using (var req = new HttpRequestMessage(HttpMethod.Get, path))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);

                using (var res = await _http.SendAsync(req).ConfigureAwait(false))
                {
                    var respBody = await res.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!res.IsSuccessStatusCode)
                    {
                        throw new InvalidOperationException(
                            path + " vratio " + (int)res.StatusCode + ": " + respBody);
                    }

                    return JsonConvert.DeserializeObject<T>(respBody, JsonSettings);
                }
            }
        }

        public void Dispose()
        {
            _http.Dispose();
        }
    }
}
