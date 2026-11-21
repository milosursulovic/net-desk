using System;
using System.Management;

namespace NetdeskAgent.Common.Inventory
{
    internal static class WmiUtils
    {
        /// <summary>
        /// Some WMI providers (e.g. Win32_PnPSignedDriver/Win32_Service, which are
        /// essentially backed by registry values written by some driver installers)
        /// can return a string with embedded null ('\0') bytes after the real
        /// value - seen live for direct registry reads in
        /// SoftwareCollector (a fixed buffer written without a proper terminator).
        /// Everything after the FIRST null byte is discarded before sending to the backend, which has
        /// narrow varchar columns - "Data too long" would otherwise break the whole insert.
        /// </summary>
        public static string GetString(ManagementBaseObject mo, string prop)
        {
            var v = mo[prop];
            if (v == null) return null;
            var s = v.ToString();
            var nulIndex = s.IndexOf('\0');
            if (nulIndex >= 0) s = s.Substring(0, nulIndex);
            return s.Trim();
        }

        public static int? GetInt(ManagementBaseObject mo, string prop)
        {
            var v = mo[prop];
            if (v == null) return null;
            try { return Convert.ToInt32(v); } catch { return null; }
        }

        public static double? GetDouble(ManagementBaseObject mo, string prop)
        {
            var v = mo[prop];
            if (v == null) return null;
            try { return Convert.ToDouble(v); } catch { return null; }
        }

        public static bool GetBool(ManagementBaseObject mo, string prop)
        {
            var v = mo[prop];
            if (v == null) return false;
            try { return Convert.ToBoolean(v); } catch { return false; }
        }

        /// <summary>
        /// WMI dates are in CIM_DATETIME format. We return an ISO 8601 string because
        /// the backend parses fields like OS.InstallDate/BIOS.ReleaseDate via
        /// new Date(...) (parseDateMaybe in metadata.service.js).
        /// </summary>
        public static string GetDateTimeIso(ManagementBaseObject mo, string prop)
        {
            var raw = mo[prop] as string;
            if (string.IsNullOrEmpty(raw)) return null;

            try
            {
                var dt = ManagementDateTimeConverter.ToDateTime(raw);
                return dt.ToUniversalTime().ToString("o");
            }
            catch
            {
                return null;
            }
        }
    }
}
