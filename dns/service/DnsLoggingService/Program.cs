using DnsLoggingService;
using SQLitePCL;

var logFile = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
    "DnsLogger",
    "fatal_log.txt"
);

try
{
    Batteries_V2.Init();
    var builder = Host.CreateApplicationBuilder(args);

    builder.Services.AddWindowsService(options =>
    {
        options.ServiceName = "DnsLoggingService";
    });

    builder.Services.AddHostedService<DnsLoggerWorker>();

    var host = builder.Build();
    host.Run();
}
catch (Exception ex)
{
    File.AppendAllText(logFile, $"[{DateTime.Now}] Fatal error: {ex}\n");
    throw;
}
