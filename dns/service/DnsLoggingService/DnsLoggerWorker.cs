using Microsoft.Data.Sqlite;
using PacketDotNet;
using SharpPcap;
using System.Text;

namespace DnsLoggingService
{
    internal class DnsLoggerWorker : BackgroundService
    {
        private readonly ILogger<DnsLoggerWorker> _logger;
        private HashSet<string> _dnsLog = new();
        private string basePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "DnsLogger"
        );
        private string dbPath;
        private string logPath;

        public DnsLoggerWorker(ILogger<DnsLoggerWorker> logger)
        {
            _logger = logger;
            Directory.CreateDirectory(basePath);
            dbPath = Path.Combine(basePath, "domains.db");
            logPath = Path.Combine(basePath, "log.txt");

            string exePath = AppContext.BaseDirectory;
            string envPath = Path.Combine(exePath, ".env");
            LoadEnvFromFile(envPath);
        }

        protected override Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                InitializeDatabase();
                return Task.Run(() => StartCapture(stoppingToken));
            }
            catch (Exception ex)
            {
                File.AppendAllText(logPath, $"[{DateTime.Now}] CRASH in ExecuteAsync: {ex}\n");
                return Task.CompletedTask;
            }
        }


        private void StartCapture(CancellationToken token)
        {
            var devices = CaptureDeviceList.Instance;
            File.AppendAllText(logPath, $"Service started at {DateTime.Now}\n");

            if (devices.Count < 1)
            {
                File.AppendAllText(logPath, $"No capture devices found at {DateTime.Now}\n");
                _logger.LogError("No capture devices found.");
                return;
            }

            foreach (var device in devices)
            {
                Task.Run(() =>
                {
                    try
                    {
                        device.OnPacketArrival += OnPacketArrival;
                        var config = new DeviceConfiguration
                        {
                            BufferSize = 65536,
                            ReadTimeout = 1000,
                            Mode = DeviceModes.Promiscuous
                        };
                        device.Open(config);
                        device.StartCapture();

                        while (!token.IsCancellationRequested)
                        {
                            Thread.Sleep(1000);
                        }

                        device.StopCapture();
                        device.Close();
                    }
                    catch (Exception ex)
                    {
                        File.AppendAllText(logPath, $"Error capturing on device {device.Description}: {ex}\n");
                    }
                }, token);
            }
        }

        private void OnPacketArrival(object sender, PacketCapture e)
        {
            try
            {
                RawCapture raw = e.GetPacket();
                Packet packet = Packet.ParsePacket(raw.LinkLayerType, raw.Data);
                var udpPacket = packet.Extract<UdpPacket>();
                if (udpPacket != null && udpPacket.DestinationPort == 53)
                {
                    string? domain = ParseDomainFromDnsQuery(udpPacket.PayloadData);
                    if (!string.IsNullOrEmpty(domain))
                    {
                        lock (_dnsLog)
                        {
                            _dnsLog.Add(domain);
                        }

                        SaveDomainToDatabase(domain);
                        UploadLog(domain);
                    }
                }
            }
            catch { }
        }

        private string? ParseDomainFromDnsQuery(byte[] data)
        {
            try
            {
                int index = 12;
                StringBuilder domain = new();
                while (data[index] != 0)
                {
                    int len = data[index++];
                    for (int i = 0; i < len; i++)
                    {
                        domain.Append((char)data[index++]);
                    }
                    domain.Append('.');
                }
                return domain.ToString().TrimEnd('.');
            }
            catch { return null; }
        }

        private void InitializeDatabase()
        {
            try
            {
                File.AppendAllText(logPath, "Initializing DB...\n");
                using var connection = new SqliteConnection($"Data Source={dbPath}");
                connection.Open();

                var tableCmd = connection.CreateCommand();
                tableCmd.CommandText =
                @"
            CREATE TABLE IF NOT EXISTS domains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        ";
                tableCmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {

                File.AppendAllText(logPath, $"DB init error: {ex}\n");
                _logger.LogError(ex, "Database initialization failed.");
            }
        }

        private void SaveDomainToDatabase(string domain)
        {
            try
            {
                using var connection = new SqliteConnection($"Data Source={dbPath}");
                connection.Open();

                var insertCmd = connection.CreateCommand();
                insertCmd.CommandText = "INSERT INTO domains (name) VALUES ($name);";
                insertCmd.Parameters.AddWithValue("$name", domain);
                insertCmd.ExecuteNonQuery();
            }
            catch (Exception ex)
            {
                File.AppendAllText(logPath, $"[{DateTime.Now}] DB insert error: {ex}\n");
                _logger.LogError(ex, "Failed to insert domain into DB.");
            }
        }


        private void UploadLog(string domain)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(new[] { domain });
            var content = new StringContent(json, Encoding.UTF8, "application/json");

            var handler = new HttpClientHandler
            {
                ServerCertificateCustomValidationCallback = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator
            };

            using var client = new HttpClient(handler);
            try
            {
                var uploadUrl = Environment.GetEnvironmentVariable("DNS_UPLOAD_URL");
                var response = client.PostAsync(uploadUrl, content).Result;
                _logger.LogInformation($"Uploaded domain {domain}: {response.StatusCode}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Failed to upload domain: {domain}");
            }
        }

        private void LoadEnvFromFile(string path)
        {
            if (!File.Exists(path)) return;

            foreach (var line in File.ReadAllLines(path))
            {
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;
                var parts = line.Split('=', 2);
                if (parts.Length == 2)
                {
                    Environment.SetEnvironmentVariable(parts[0].Trim(), parts[1].Trim());
                }
            }
        }

    }
}
