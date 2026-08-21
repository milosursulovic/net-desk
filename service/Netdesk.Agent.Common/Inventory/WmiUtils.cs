using System;
using System.Management;

namespace NetdeskAgent.Common.Inventory
{
    internal static class WmiUtils
    {
        /// <summary>
        /// Neki WMI provajderi (npr. Win32_PnPSignedDriver/Win32_Service, koji su
        /// u osnovi backed-ovani registry vrednostima nekih drajver instalera)
        /// mogu vratiti string sa embedded null ('\0') bajtovima posle prave
        /// vrednosti - viđeno uživo za registry-direktne čitanja u
        /// SoftwareCollector-u (fiksni bafer upisan bez pravog terminatora).
        /// Sve posle PRVOG null bajta se odbacuje pre slanja backend-u, koji ima
        /// uske varchar kolone - "Data too long" bi inače srušio ceo insert.
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
