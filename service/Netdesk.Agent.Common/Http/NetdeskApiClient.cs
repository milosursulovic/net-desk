using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using NetdeskAgent.Common.Models;
using NetdeskAgent.Common.Inventory;
using NetdeskAgent.Common.Jobs;
using NetdeskAgent.Common.Update;

namespace NetdeskAgent.Common.Http
{
    /// <summary>
    /// Tanak wrapper oko HttpClient-a za /api/agents/* endpoint-e. Auth šema
    /// prati backend konvenciju (middlewares/agentAuth.middleware.js):
    ///   - enroll:      Authorization: Bearer <enrollToken>
    ///   - sve ostalo:  Authorization: Bearer <agentId>:<apiKey>
    /// JSON (de)serijalizacija ide preko camelCase contract resolvera da se
    /// poklopi sa backend DTO poljima bez ručnog [JsonProperty] po svakom polju.
    /// </summary>
    public class NetdeskApiClient : IDisposable
    {
        private readonly HttpClient _http;

        public string BaseUrl { get; }

        private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new CamelCasePropertyNamesContractResolver(),
            NullValueHandling = NullValueHandling.Ignore,
        };

        public NetdeskApiClient(string baseUrl)
        {
            BaseUrl = baseUrl;
            _http = new HttpClient { BaseAddress = new Uri(baseUrl) };
            _http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public Task<EnrollResponse> EnrollAsync(string enrollToken, EnrollRequest request)
        {
            return PostAsync<EnrollResponse>("/api/agents/enroll", enrollToken, request);
        }

        public Task<HeartbeatResponse> HeartbeatAsync(string agentId, string apiKey, HeartbeatRequest request)
        {
            return PostAsync<HeartbeatResponse>("/api/agents/heartbeat", AgentBearer(agentId, apiKey), request);
        }

        public Task<PingResponse> PingAsync(string agentId, string apiKey)
        {
            return GetAsync<PingResponse>("/api/agents/ping", AgentBearer(agentId, apiKey));
        }

        /// <summary>
        /// InventoryRequest ima sopstvene eksplicitne [JsonProperty] nazive
        /// (PascalCase/akronimska polja poput "NICs" moraju tačno da se poklope
        /// sa backend pick() alternativama - videti InventoryModels.cs) pa se
        /// namerno NE serijalizuje preko JsonSettings (koji bi override-ovao
        /// [JsonProperty] camelCase-ovanjem imena bez atributa, ali ne dira
        /// polja koja već imaju eksplicitan atribut - ipak, koristimo čist
        /// serializer ovde radi jasnoće da je ovo poseban, strogo mapiran ugovor).
        /// </summary>
        public Task<InventoryResponse> PostInventoryAsync(string agentId, string apiKey, InventoryRequest request)
        {
            return PostRawAsync<InventoryResponse>("/api/agents/inventory", AgentBearer(agentId, apiKey), request);
        }

        public Task<JobsResponse> GetJobsAsync(string agentId, string apiKey)
        {
            return GetAsync<JobsResponse>("/api/agents/jobs", AgentBearer(agentId, apiKey));
        }

        public Task SubmitJobResultAsync(string agentId, string apiKey, long jobId, JobResultRequest request)
        {
            return PostAsync<object>("/api/agents/jobs/" + jobId + "/result", AgentBearer(agentId, apiKey), request);
        }

        public Task<UpdateCheckResponse> CheckUpdateAsync(string agentId, string apiKey)
        {
            return GetAsync<UpdateCheckResponse>("/api/agents/update", AgentBearer(agentId, apiKey));
        }

        public async Task DownloadUpdateFileAsync(string agentId, string apiKey, string downloadUrl, string destinationPath)
        {
            using (var req = new HttpRequestMessage(HttpMethod.Get, downloadUrl))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", AgentBearer(agentId, apiKey));

                using (var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false))
                {
                    if (!res.IsSuccessStatusCode)
                    {
                        var errBody = await res.Content.ReadAsStringAsync().ConfigureAwait(false);
                        throw new NetdeskApiException((int)res.StatusCode, errBody);
                    }

                    using (var httpStream = await res.Content.ReadAsStreamAsync().ConfigureAwait(false))
                    using (var fileStream = new FileStream(destinationPath, FileMode.Create, FileAccess.Write))
                    {
                        await httpStream.CopyToAsync(fileStream).ConfigureAwait(false);
                    }
                }
            }
        }

        public Task ReportUpdateAsync(string agentId, string apiKey, UpdateReportRequest request)
        {
            return PostAsync<object>("/api/agents/update/report", AgentBearer(agentId, apiKey), request);
        }

        private static string AgentBearer(string agentId, string apiKey)
        {
            return agentId + ":" + apiKey;
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
                        throw new NetdeskApiException((int)res.StatusCode, respBody);
                    }

                    return JsonConvert.DeserializeObject<T>(respBody, JsonSettings);
                }
            }
        }

        private static readonly JsonSerializerSettings RawJsonSettings = new JsonSerializerSettings
        {
            NullValueHandling = NullValueHandling.Ignore,
        };

        private async Task<T> PostRawAsync<T>(string path, string bearerToken, object body)
        {
            var json = JsonConvert.SerializeObject(body, RawJsonSettings);

            using (var req = new HttpRequestMessage(HttpMethod.Post, path))
            {
                req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
                req.Content = new StringContent(json, Encoding.UTF8, "application/json");

                using (var res = await _http.SendAsync(req).ConfigureAwait(false))
                {
                    var respBody = await res.Content.ReadAsStringAsync().ConfigureAwait(false);

                    if (!res.IsSuccessStatusCode)
                    {
                        throw new NetdeskApiException((int)res.StatusCode, respBody);
                    }

                    return JsonConvert.DeserializeObject<T>(respBody, RawJsonSettings);
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
                        throw new NetdeskApiException((int)res.StatusCode, respBody);
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
