// computer_metadata.cpu_name is the raw Win32_Processor.Name string, with no
// structured "tier" field - the classification is derived from the text.
// Same pattern as printerManufacturer.js (order matters, the first match
// wins), here there are just two outcomes + null (unclassified - Xeon and the like are
// deliberately NOT pushed into either category, it's ambiguous).
const WEAK_PATTERN = /\bceleron\b|\bpentium\b|\bathlon\b|\bamd\s+a\d/i;
const STRONG_PATTERN = /\bcore\b.*\bi[3579]\b|\bi[3579][- ]|\bryzen\b/i;

export function classifyCpuTier(cpuName) {
  const name = String(cpuName || "").trim();
  if (!name) return null;
  if (WEAK_PATTERN.test(name)) return "weak";
  if (STRONG_PATTERN.test(name)) return "strong";
  return null;
}
