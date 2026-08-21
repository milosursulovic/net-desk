using System;
using System.Collections.Generic;
using System.Globalization;
using Microsoft.Win32;
using NetdeskAgent.Common.Logging;

namespace NetdeskAgent.Common.Inventory
{
    /// <summary>
    /// Instalirani softver preko registry Uninstall ključeva - namerno NE preko
    /// WMI Win32_Product (poznato spor upit koji pokreće MSI consistency-check
    /// odnosno "repair" za svaki paket, ozbiljno degradira performanse mašine).
    /// Čita i 64-bit i 32-bit (WOW6432Node) pogled na HKLM.
    /// </summary>
    public static class SoftwareCollector
    {
        private const string UninstallKeyPath =
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";

        private const string UninstallKeyPathWow6432 =
            @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

        public static List<SoftwareItem> Collect()
        {
            var result = new List<SoftwareItem>();

            ReadFromView(RegistryView.Registry64, UninstallKeyPath, result);
            ReadFromView(RegistryView.Registry32, UninstallKeyPathWow6432, result);

            return result;
        }

        private static void ReadFromView(RegistryView view, string keyPath, List<SoftwareItem> result)
        {
            try
            {
                using (var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view))
                using (var uninstallKey = baseKey.OpenSubKey(keyPath))
                {
                    if (uninstallKey == null) return;

                    foreach (var subKeyName in uninstallKey.GetSubKeyNames())
                    {
                        using (var subKey = uninstallKey.OpenSubKey(subKeyName))
                        {
                            var item = ReadEntry(subKey);
                            if (item != null) result.Add(item);
                        }
                    }
                }
            }
            catch (PlatformNotSupportedException)
            {
                // Registry64 pogled ne postoji na pravom 32-bit OS-u - preskoči.
            }
            catch (Exception ex)
            {
                FileLogger.Warn("Čitanje instaliranog softvera neuspešno (" + keyPath + "): " + ex.Message);
            }
        }

        private static SoftwareItem ReadEntry(RegistryKey subKey)
        {
            if (subKey == null) return null;

            var displayName = subKey.GetValue("DisplayName") as string;
            if (string.IsNullOrWhiteSpace(displayName)) return null;

            // SystemComponent=1 označava interne/skrivene komponente (npr. update
            // paketi, redistributable-ovi koje Windows sam upravlja) - preskačemo
            // ih kao i standardni "Programs and Features" prikaz u Panelu.
            var systemComponent = subKey.GetValue("SystemComponent");
            if (systemComponent is int && (int)systemComponent == 1) return null;

            return new SoftwareItem
            {
                DisplayName = CleanRegistryString(displayName),
                DisplayVersion = CleanRegistryString(subKey.GetValue("DisplayVersion") as string),
                Publisher = CleanRegistryString(subKey.GetValue("Publisher") as string),
                InstallDate = ParseInstallDate(subKey.GetValue("InstallDate") as string),
            };
        }

        /// <summary>
        /// Otkriveno uživo: neki drajver instaleri (npr. BIXOLON štampački
        /// drajver) pišu fiksne-veličine bafere u registry bez pravog null-
        /// terminatora na kraju iskorišćenog dela - RegistryKey.GetValue skida
        /// SAMO JEDAN trailing null karakter, pa stotine preostalih "\0" bajtova
        /// stižu ovde kao deo "stringa". Sve posle PRVOG null bajta se odbacuje
        /// pre slanja backend-u, koji ima uske varchar kolone ("Data too long"
        /// je uživo srušio ceo insert, ne samo taj jedan red).
        /// </summary>
        private static string CleanRegistryString(string raw)
        {
            if (raw == null) return null;
            var nulIndex = raw.IndexOf('\0');
            return (nulIndex >= 0 ? raw.Substring(0, nulIndex) : raw).Trim();
        }

        /// <summary>
        /// Registry obično čuva InstallDate kao "yyyymmdd", ali neki instaleri
        /// pišu potpuno drugačiji/neispravan format (viđeno uživo: čist broj
        /// poput "1784235052", ni nalik datumu). Backend upisuje ovo u MySQL
        /// DATE kolonu - vraćanje sirove neprepoznate vrednosti bi srušilo ceo
        /// insert (potvrđeno uživo testiranjem). Kad format nije prepoznat,
        /// vraćamo null - "nepoznat datum instalacije" je legitimno stanje,
        /// kolona je nullable.
        /// </summary>
        private static string ParseInstallDate(string raw)
        {
            if (string.IsNullOrEmpty(raw) || raw.Length != 8) return null;

            DateTime parsed;
            if (DateTime.TryParseExact(raw, "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed))
            {
                return parsed.ToString("yyyy-MM-dd");
            }

            return null;
        }
    }
}
