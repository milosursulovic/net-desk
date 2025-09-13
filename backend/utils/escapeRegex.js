// Prevents ReDoS and accidental special chars in search
export default function escapeRegex(input = "") {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
