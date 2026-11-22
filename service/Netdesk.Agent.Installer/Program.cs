using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using Microsoft.Win32;

namespace NetdeskAgent.Installer
{
    /// <summary>
    /// Single-file installer for the Netdesk Agent (Service) + NetdeskAgentManager.
    /// Replaces the old "zip in a zip + Install-NetdeskAgent.ps1" deploy: that
    /// script needed PowerShell 5 (Expand-Archive, Is64BitOperatingSystem), which
    /// Windows 7 doesn't have out of the box, and the zips had to be rebuilt by hand.
    ///
    /// Always a full clean install (same semantics as the old script): both
    /// services are removed, Program Files\NetdeskAgent and
    /// ProgramData\NetdeskAgent are wiped, so the agent enrolls again from scratch.
    ///
    /// Console output is deliberately ASCII-only - the Windows 7 console code page
    /// (852/1250) would garble Serbian diacritics.
    ///
    /// Usage: NetdeskAgentSetup.exe [/quiet]   (/quiet = no "press Enter" at the end)
    /// Exit code: 0 = success, 1 = failure. Full log: %ProgramData%\NetdeskAgentSetup.log
    /// </summary>
    internal static class Program
    {
        private const string AgentServiceName = "NetdeskAgent";
        private const string ManagerServiceName = "NetdeskAgentManager";
        private const string ServerUrlPlaceholder = "{{SERVER_BASE_URL}}";

        private static string _logPath;

        private static int Main(string[] args)
        {
            var quiet = args.Any(a =>
                a.Equals("/quiet", StringComparison.OrdinalIgnoreCase) ||
                a.Equals("/q", StringComparison.OrdinalIgnoreCase) ||
                a.Equals("--quiet", StringComparison.OrdinalIgnoreCase));

            var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            _logPath = Path.Combine(programData, "NetdeskAgentSetup.log");

            int exitCode;
            try
            {
                LogFileOnly("===== " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " =====");
                Install(programData);
                exitCode = 0;
            }
            catch (Exception ex)
            {
                Log("");
                Log("GRESKA: " + ex.Message);
                LogFileOnly(ex.ToString());
                Log("Detalji: " + _logPath);
                exitCode = 1;
            }

            if (!quiet)
            {
                Console.WriteLine();
                Console.WriteLine("Pritisni Enter za izlaz...");
                Console.ReadLine();
            }

            return exitCode;
        }

        private static void Install(string programData)
        {
            var tempDir = Path.Combine(Path.GetTempPath(), "NetdeskAgentSetup_" + Guid.NewGuid().ToString("N"));
            try
            {
                ExtractPayload(tempDir);
                var setup = ReadIni(Path.Combine(tempDir, "setup.ini"));

                var isWin7 = IsWindows7();
                var serverUrl = isWin7 ? setup["ServerUrlWin7"] : setup["ServerUrl"];

                // ProgramW6432 always points at the real 64-bit "Program Files" (even from a
                // 32-bit process); it doesn't exist on 32-bit Windows, hence the fallback.
                var programFiles = Environment.GetEnvironmentVariable("ProgramW6432");
                if (string.IsNullOrEmpty(programFiles))
                {
                    programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                }

                var installDir = Path.Combine(programFiles, "NetdeskAgent");
                var agentDataDir = Path.Combine(programData, "NetdeskAgent");
                var managerDataDir = Path.Combine(programData, "NetdeskAgentManager");

                Log("Netdesk Agent setup - agent " + setup["AgentVersion"] + ", manager " + setup["ManagerVersion"]);
                Log("OS: " + Environment.OSVersion.VersionString + (isWin7 ? " (Windows 7)" : "")
                    + (Environment.Is64BitOperatingSystem ? ", 64-bit" : ", 32-bit"));
                Log("Server: " + serverUrl);
                Log("");

                EnsureNetFramework452();

                Step("Uklanjanje postojece instalacije");
                RemoveService(ManagerServiceName);
                RemoveService(AgentServiceName);
                // WinDivert64.sys can stay locked briefly after the agent stops; stopping the
                // driver service helps, the delete retry below covers the rest.
                RunProcess("sc.exe", "stop WinDivert");
                DeleteDirectoryWithRetry(installDir);
                DeleteDirectoryWithRetry(agentDataDir);
                DeleteFileIfExists(Path.Combine(managerDataDir, "manager-state.json"));
                DeleteFileIfExists(Path.Combine(managerDataDir, "config.json"));

                var rootCa = Path.Combine(tempDir, "rootCA.pem");
                if (File.Exists(rootCa))
                {
                    Step("Instalacija interne CA u Local Machine\\Root");
                    RunChecked("certutil.exe", "-addstore -f Root " + Quote(rootCa));
                }

                if (isWin7)
                {
                    Step("Windows 7: hosts unos i TLS 1.2");
                    string hostsLine;
                    if (setup.TryGetValue("HostsLineWin7", out hostsLine) && hostsLine.Length > 0)
                    {
                        AddHostsLine(hostsLine);
                    }
                    EnableWindows7Tls12();
                }

                Step("Kopiranje fajlova u " + installDir);
                CopyDirectory(Path.Combine(tempDir, "Service"), Path.Combine(installDir, "Service"));
                CopyDirectory(Path.Combine(tempDir, "Manager"), Path.Combine(installDir, "Manager"));

                Step("Upis konfiguracije");
                WriteConfig(Path.Combine(tempDir, "agent-config.json"), Path.Combine(agentDataDir, "config.json"), serverUrl);
                WriteConfig(Path.Combine(tempDir, "manager-config.json"), Path.Combine(managerDataDir, "config.json"), serverUrl);

                Step("Registracija servisa");
                var installUtil = GetInstallUtilPath();
                RunChecked(installUtil, Quote(Path.Combine(installDir, "Service", "Netdesk.Agent.Service.exe")));
                RunChecked(installUtil, Quote(Path.Combine(installDir, "Manager", "Netdesk.Agent.Manager.exe")));
                ConfigureRecovery(AgentServiceName);
                ConfigureRecovery(ManagerServiceName);

                Step("Pokretanje servisa");
                StartService(AgentServiceName, critical: true);
                StartService(ManagerServiceName, critical: false);

                Log("");
                Log("Gotovo. Agent log: " + Path.Combine(agentDataDir, "logs", "agent.log"));
                if (isWin7)
                {
                    Log("");
                    Log("PAZNJA: Windows 7 - TLS 1.2 podesavanja vaze tek posle RESTARTA racunara.");
                    Log("Do restarta agent ne moze da se poveze na server (TLS greske u logu).");
                }
            }
            finally
            {
                TryDeleteDirectory(tempDir);
            }
        }

        // ---------- payload ----------

        private static void ExtractPayload(string targetDir)
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            {
                if (stream == null)
                {
                    throw new InvalidOperationException(
                        "Installer nema ugradjen paket - napravi ga preko service\\Build-Installer.ps1.");
                }

                Directory.CreateDirectory(targetDir);
                var root = Path.GetFullPath(targetDir) + Path.DirectorySeparatorChar;

                using (var zip = new ZipArchive(stream, ZipArchiveMode.Read))
                {
                    foreach (var entry in zip.Entries)
                    {
                        // Normalize separators - zips created on another machine may use '\'.
                        var name = entry.FullName.Replace('\\', '/');
                        if (name.EndsWith("/", StringComparison.Ordinal)) continue;

                        var dest = Path.GetFullPath(Path.Combine(targetDir, name.Replace('/', Path.DirectorySeparatorChar)));
                        if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new InvalidDataException("Neispravna putanja u paketu: " + entry.FullName);
                        }

                        Directory.CreateDirectory(Path.GetDirectoryName(dest));
                        entry.ExtractToFile(dest, true);
                    }
                }
            }
        }

        private static Dictionary<string, string> ReadIni(string path)
        {
            var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in File.ReadAllLines(path))
            {
                var line = raw.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal)) continue;
                var eq = line.IndexOf('=');
                if (eq <= 0) continue;
                result[line.Substring(0, eq).Trim()] = line.Substring(eq + 1).Trim();
            }

            foreach (var key in new[] { "ServerUrl", "ServerUrlWin7", "AgentVersion", "ManagerVersion" })
            {
                if (!result.ContainsKey(key)) throw new InvalidDataException("setup.ini nema '" + key + "'.");
            }
            return result;
        }

        private static void WriteConfig(string templatePath, string destPath, string serverUrl)
        {
            var json = File.ReadAllText(templatePath).Replace(ServerUrlPlaceholder, serverUrl);
            Directory.CreateDirectory(Path.GetDirectoryName(destPath));
            // UTF-8 without BOM, the same as the agent's own File.ReadAllText/WriteAllText.
            File.WriteAllText(destPath, json, new UTF8Encoding(false));
            Log("  " + destPath);
        }

        // ---------- services ----------

        private static ServiceController FindService(string name)
        {
            ServiceController found = null;
            foreach (var s in ServiceController.GetServices())
            {
                if (found == null && s.ServiceName.Equals(name, StringComparison.OrdinalIgnoreCase)) found = s;
                else s.Dispose();
            }
            return found;
        }

        private static bool ServiceExists(string name)
        {
            using (var s = FindService(name)) return s != null;
        }

        private static void RemoveService(string name)
        {
            using (var svc = FindService(name))
            {
                if (svc == null) return;

                Log("  Servis " + name + " postoji - zaustavljam i uklanjam");
                try
                {
                    if (svc.Status != ServiceControllerStatus.Stopped)
                    {
                        svc.Stop();
                        svc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(30));
                    }
                }
                catch (Exception ex)
                {
                    Log("  Upozorenje: zaustavljanje " + name + " nije uspelo: " + ex.Message);
                }
            }

            // Our handle is disposed above - with an open handle the SCM would only
            // mark the service "pending deletion" instead of removing it.
            RunProcess("sc.exe", "delete " + name);
            for (var i = 0; i < 15 && ServiceExists(name); i++) Thread.Sleep(1000);

            if (ServiceExists(name))
            {
                throw new InvalidOperationException(
                    "Servis '" + name + "' i dalje postoji posle brisanja. Zatvori services.msc/Task Manager i pokusaj ponovo, ili restartuj racunar.");
            }
        }

        private static void ConfigureRecovery(string name)
        {
            RunProcess("sc.exe", "failure " + name + " reset= 86400 actions= restart/60000/restart/60000/restart/60000");
        }

        private static void StartService(string name, bool critical)
        {
            try
            {
                using (var svc = FindService(name))
                {
                    if (svc == null) throw new InvalidOperationException("servis nije registrovan");
                    svc.Start();
                    svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(30));
                }
                Log("  " + name + ": Running");
            }
            catch (Exception ex)
            {
                var message = "Pokretanje servisa " + name + " nije uspelo: " + ex.Message;
                if (critical) throw new InvalidOperationException(message, ex);
                Log("  Upozorenje: " + message);
            }
        }

        private static string GetInstallUtilPath()
        {
            // Depends on the OS bitness, not the agent's (Framework64 doesn't exist on 32-bit Windows).
            var framework = Environment.Is64BitOperatingSystem ? "Framework64" : "Framework";
            var path = Path.Combine(
                Environment.GetEnvironmentVariable("WINDIR") ?? @"C:\Windows",
                "Microsoft.NET", framework, "v4.0.30319", "InstallUtil.exe");
            if (!File.Exists(path))
            {
                throw new FileNotFoundException("InstallUtil.exe nije pronadjen - .NET Framework 4.5.2+ nije instaliran?", path);
            }
            return path;
        }

        /// <summary>
        /// The agent's exe.config demands .NET 4.5.2 (supportedRuntime sku), so on 4.5/4.5.1
        /// the service would install but never start. This exe ships without its .config
        /// and would happily run on 4.5.1 - hence the explicit check before touching anything.
        /// </summary>
        private static void EnsureNetFramework452()
        {
            const int Net452Release = 379893;
            object release = null;
            var view = Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Default;
            using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
            using (var key = hklm.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full"))
            {
                if (key != null) release = key.GetValue("Release");
            }

            if (!(release is int) || (int)release < Net452Release)
            {
                throw new InvalidOperationException(
                    ".NET Framework 4.5.2 ili noviji nije instaliran (Release=" + (release ?? "nema") + "). "
                    + "Instaliraj .NET Framework 4.8 (ndp48-x86-x64-allos-enu.exe) pa pokreni setup ponovo.");
            }
        }

        // ---------- Windows 7 specifics ----------

        private static bool IsWindows7()
        {
            // 6.1 = Windows 7 / Server 2008 R2 - the same Schannel/TLS 1.2 problem on both.
            var v = Environment.OSVersion.Version;
            return v.Major == 6 && v.Minor == 1;
        }

        private static void AddHostsLine(string line)
        {
            var hostsPath = Path.Combine(Environment.SystemDirectory, "drivers", "etc", "hosts");
            var existing = File.Exists(hostsPath) ? File.ReadAllText(hostsPath) : "";
            var normalized = string.Join(" ", line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries));

            var alreadyThere = existing
                .Split(new[] { "\r\n", "\n" }, StringSplitOptions.None)
                .Any(l => string.Join(" ", l.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries))
                    .Equals(normalized, StringComparison.OrdinalIgnoreCase));
            if (alreadyThere)
            {
                Log("  hosts: vec postoji '" + normalized + "'");
                return;
            }

            var prefix = existing.Length > 0 && !existing.EndsWith("\n", StringComparison.Ordinal) ? "\r\n" : "";
            File.AppendAllText(hostsPath, prefix + normalized + "\r\n", Encoding.ASCII);
            Log("  hosts: dodato '" + normalized + "'");
        }

        private static void EnableWindows7Tls12()
        {
            // Windows 7 has TLS 1.2 disabled for clients by default; without this the
            // agent's HTTPS calls fail. Takes effect only after a reboot.
            var view = Environment.Is64BitOperatingSystem ? RegistryView.Registry64 : RegistryView.Default;
            using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
            {
                foreach (var side in new[] { "Client", "Server" })
                {
                    using (var key = hklm.CreateSubKey(@"SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\TLS 1.2\" + side))
                    {
                        key.SetValue("DisabledByDefault", 0, RegistryValueKind.DWord);
                        key.SetValue("Enabled", 1, RegistryValueKind.DWord);
                    }
                }
            }

            // SchUseStrongCrypto in both registry views (64-bit and WOW6432Node).
            var views = Environment.Is64BitOperatingSystem
                ? new[] { RegistryView.Registry64, RegistryView.Registry32 }
                : new[] { RegistryView.Default };
            foreach (var v in views)
            {
                using (var hklm = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, v))
                using (var key = hklm.CreateSubKey(@"SOFTWARE\Microsoft\.NETFramework\v4.0.30319"))
                {
                    key.SetValue("SchUseStrongCrypto", 1, RegistryValueKind.DWord);
                }
            }
            Log("  TLS 1.2 / SchUseStrongCrypto podeseno");
        }

        // ---------- file system ----------

        private static void CopyDirectory(string source, string dest)
        {
            if (!Directory.Exists(source)) throw new DirectoryNotFoundException("Paket nema folder: " + source);

            Directory.CreateDirectory(dest);
            foreach (var dir in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
            {
                Directory.CreateDirectory(Path.Combine(dest, dir.Substring(source.Length + 1)));
            }
            foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
            {
                File.Copy(file, Path.Combine(dest, file.Substring(source.Length + 1)), true);
            }
        }

        private static void DeleteDirectoryWithRetry(string path)
        {
            if (!Directory.Exists(path)) return;

            Log("  Brisanje " + path);
            // Transient locks (WinDivert64.sys right after the agent stops, AV scans) surface as
            // either IOException or UnauthorizedAccessException - retry both for ~10s.
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    foreach (var f in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                    {
                        File.SetAttributes(f, FileAttributes.Normal);
                    }
                    Directory.Delete(path, true);
                    return;
                }
                catch (Exception ex) when ((ex is IOException || ex is UnauthorizedAccessException) && attempt < 20)
                {
                    Thread.Sleep(500);
                }
                catch (DirectoryNotFoundException)
                {
                    return;
                }
            }
        }

        private static void DeleteFileIfExists(string path)
        {
            if (File.Exists(path)) File.Delete(path);
        }

        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path)) Directory.Delete(path, true);
            }
            catch
            {
                /* best-effort cleanup of the temp folder */
            }
        }

        // ---------- processes ----------

        private static void RunChecked(string fileName, string arguments)
        {
            var code = RunProcess(fileName, arguments);
            if (code != 0)
            {
                throw new InvalidOperationException(
                    Path.GetFileName(fileName) + " je vratio kod " + code + " (detalji u " + _logPath + ").");
            }
        }

        private static int RunProcess(string fileName, string arguments)
        {
            LogFileOnly("> " + fileName + " " + arguments);
            var psi = new ProcessStartInfo(fileName, arguments)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };

            using (var p = Process.Start(psi))
            {
                var stderr = p.StandardError.ReadToEndAsync();
                var stdout = p.StandardOutput.ReadToEnd();
                p.WaitForExit();
                LogFileOnly(stdout.TrimEnd());
                LogFileOnly(stderr.Result.TrimEnd());
                LogFileOnly("exit " + p.ExitCode);
                return p.ExitCode;
            }
        }

        private static string Quote(string path)
        {
            return "\"" + path + "\"";
        }

        // ---------- logging ----------

        private static void Step(string title)
        {
            Log("");
            Log("== " + title);
        }

        private static void Log(string message)
        {
            Console.WriteLine(message);
            LogFileOnly(message);
        }

        private static void LogFileOnly(string message)
        {
            if (string.IsNullOrEmpty(message)) return;
            try
            {
                File.AppendAllText(_logPath, message + Environment.NewLine);
            }
            catch
            {
                /* logging must never break the install */
            }
        }
    }
}
