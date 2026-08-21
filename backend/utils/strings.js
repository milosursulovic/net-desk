export function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Otkriveno uživo: neki drajver instaleri (npr. BIXOLON štampački drajver)
// pišu fiksne-veličine bafere u registry bez pravog null-terminatora na
// kraju iskorišćenog dela - .NET-ova RegistryKey.GetValue() skida SAMO
// JEDAN trailing null karakter, pa ostatak (stotine "\0" bajtova) stiže
// agentu, pa ovde, kao deo "stringa". Rezultat: display_version od >1000
// karaktera protiv varchar(100) kolone - "Data too long" je srušio CEO
// insert (i time celu inventory sinhronizaciju za tu mašinu, zauvek dok
// se ne popravi). Sve posle PRVOG null bajta se odbacuje (ne samo
// poslednji), plus tvrdo sečenje na maxLength kao mreža za bilo koju drugu
// neočekivano dugu vrednost - isti "ne sme da obori insert" princip kao
// ParseInstallDate u SoftwareCollector.cs (agent) i parseDateMaybe (ovde).
export function sanitizeText(v, maxLength) {
  if (v == null) return null;
  const nulIndex = String(v).indexOf("\0");
  const cleaned = (nulIndex === -1 ? String(v) : String(v).slice(0, nulIndex)).trim();
  if (!cleaned) return null;
  return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
