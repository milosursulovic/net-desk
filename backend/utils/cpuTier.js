// computer_metadata.cpu_name je sirov Win32_Processor.Name string, bez
// strukturisanog polja za "tier" - klasifikacija se izvodi iz teksta.
// Isti obrazac kao printerManufacturer.js (redosled bitan, prvo poklapanje
// pobeđuje), ovde su samo dva ishoda + null (neklasifikovano - Xeon i sl. se
// namerno NE gura ni u jednu kategoriju, dvosmisleno je).
const WEAK_PATTERN = /\bceleron\b|\bpentium\b|\bathlon\b|\bamd\s+a\d/i;
const STRONG_PATTERN = /\bcore\b.*\bi[3579]\b|\bi[3579][- ]|\bryzen\b/i;

export function classifyCpuTier(cpuName) {
  const name = String(cpuName || "").trim();
  if (!name) return null;
  if (WEAK_PATTERN.test(name)) return "weak";
  if (STRONG_PATTERN.test(name)) return "strong";
  return null;
}
