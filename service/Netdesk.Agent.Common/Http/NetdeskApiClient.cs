using System;
using System.IO;
using System.Net;
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
    /// A thin wrapper around HttpClient for the /api/agents/* endpoints. The auth scheme
    /// follows the backend convention (middlewares/agentAuth.middleware.js):
    ///   - enroll:      Authorization: Bearer <enrollToken>
    ///   - everything else:  Authorization: Bearer <agentId>:<apiKey>
    /// JSON (de)serialization goes through a camelCase contract resolver to
    /// match the backend DTO fields without a manual [JsonProperty] on every field.
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
            // .NET Framework 4.5.2 doesn't include TLS 1.2 in the default
            // ServicePointManager.SecurityProtocol set (unlike 4.6+) -
            // without this, HTTPS calls to a modern server (Node/Express here)
            // fail with "Could not create SSL/TLS secure channel." Discovered
            // live on a Windows machine - see the backend memory for details.
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

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
        /// InventoryRequest has its own explicit [JsonProperty] names
        /// (PascalCase/acronym fields like "NICs" must exactly match
        /// the backend pick() alternatives - see InventoryModels.cs), so it's
        /// deliberately NOT serialized via JsonSettings but via RawJsonSettings
        /// (a separate DefaultContractResolver that explicitly preserves those names -
        /// see the note on RawJsonSettings for details about the live-discovered
        /// bug that motivated this).
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

        /// <summary>
        /// Reports the outcome of the consent dialog from the workstation BEFORE
        /// the VNC bridge comes up (ban on unsolicited screen capture).
        /// consentStatus: "granted" | "denied" | "timeout" | "unavailable".
        /// The fields match VncConsentSchema via the camelCase resolver.
        /// </summary>
        public Task ReportVncConsentAsync(
            string agentId, string apiKey, long sessionId,
            string consentStatus, string approverUsername, string agentIp, string agentMac)
        {
            return PostAsync<object>(
                "/api/agents/vnc-sessions/" + sessionId + "/consent",
                AgentBearer(agentId, apiKey),
                new
                {
                    ConsentStatus = consentStatus,
                    ApproverUsername = approverUsername,
                    AgentIp = agentIp,
                    AgentMac = agentMac,
                });
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

        // NOTE (fixed after a live-discovered bug): a plain
        // CamelCasePropertyNamesContractResolver OVERRIDES explicit
        // [JsonProperty] names (e.g. "OS" becomes "os") - contrary to the earlier
        // assumption that an explicit attribute always wins over the resolver. This was
        // confirmed live (an isolated test with the same Newtonsoft.Json 13.0.3
        // version) and caused a silent bug: InventoryRequest sends "os"/
        // "system"/... instead of "OS"/"System"/..., and the backend's merge (
        // patchMetadataForIpEntry) checks the PascalCase key first - when the
        // metadata row already exists (the second and every subsequent sync), that old
        // PascalCase key (empty/null) "shadows" the fresh camelCase data before
        // it's even reached, so the metadata stays permanently
        // empty after the first sync. Fix: an explicit DefaultContractResolver
        // with CamelCaseNamingStrategy { OverrideSpecifiedNames = false } -
        // this KEEPS explicit [JsonProperty] names (OS/System/NICs/GPUs/...)
        // UNTOUCHED, while still camelCasing nested lists without attributes
        // (SoftwareItem/PrinterItem/EventLogItem/...) - verified with an
        // isolated test that both cases work correctly at the same time.
        private static readonly JsonSerializerSettings RawJsonSettings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver
            {
                NamingStrategy = new CamelCaseNamingStrategy
                {
                    OverrideSpecifiedNames = false,
                },
            },
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
