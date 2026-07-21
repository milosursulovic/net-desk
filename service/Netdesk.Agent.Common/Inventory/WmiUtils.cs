using System;
using System.Management;

namespace NetdeskAgent.Common.Inventory
{
    internal static class WmiUtils
    {
        public static string GetString(ManagementBaseObject mo, string prop)
        {
            var v = mo[prop];
            return v == null ? null : v.ToString().Trim();
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
        /// WMI datumi su u CIM_DATETIME formatu. Vraćamo ISO 8601 string jer
        /// backend polja poput OS.InstallDate/BIOS.ReleaseDate parsira preko
        /// new Date(...) (parseDateMaybe u metadata.service.js).
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
