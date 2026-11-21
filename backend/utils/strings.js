export function emptyToNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// Discovered live: some driver installers (e.g. the BIXOLON printer driver)
// write fixed-size buffers into the registry without a proper null terminator at
// the end of the used part - .NET's RegistryKey.GetValue() strips ONLY
// ONE trailing null character, so the rest (hundreds of "\0" bytes) reaches the
// agent, and then here, as part of the "string". Result: a display_version of >1000
// characters against a varchar(100) column - "Data too long" broke the WHOLE
// insert (and with it the whole inventory sync for that machine, forever until
// it's fixed). Everything after the FIRST null byte is discarded (not just the
// last one), plus a hard cut at maxLength as a safety net for any other
// unexpectedly long value - the same "must not break the insert" principle as
// ParseInstallDate in SoftwareCollector.cs (agent) and parseDateMaybe (here).
export function sanitizeText(v, maxLength) {
  if (v == null) return null;
  const nulIndex = String(v).indexOf("\0");
  const cleaned = (nulIndex === -1 ? String(v) : String(v).slice(0, nulIndex)).trim();
  if (!cleaned) return null;
  return maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
