// Win32_Printer (WMI) has no structured manufacturer field - the classification
// is derived from the driver/printer name text (it almost always contains the brand,
// e.g. "HP Universal Printing PCL 6", "Canon Generic Plus PCL6"). The order of the
// list matters - the first match wins.
const MANUFACTURER_PATTERNS = [
  { label: "HP", pattern: /\bhp\b|hewlett[- ]?packard/i },
  { label: "Canon", pattern: /canon/i },
  { label: "Epson", pattern: /epson/i },
  { label: "Brother", pattern: /brother/i },
  { label: "Xerox", pattern: /xerox/i },
  { label: "Lexmark", pattern: /lexmark/i },
  { label: "Samsung", pattern: /samsung/i },
  { label: "Kyocera", pattern: /kyocera/i },
  { label: "Ricoh", pattern: /ricoh/i },
  { label: "Konica Minolta", pattern: /konica|minolta/i },
  { label: "Dell", pattern: /\bdell\b/i },
  { label: "OKI", pattern: /\boki\b/i },
  { label: "Sharp", pattern: /sharp/i },
  { label: "Panasonic", pattern: /panasonic/i },
  { label: "Zebra", pattern: /zebra/i },
  { label: "Pantum", pattern: /pantum/i },
];

export function classifyPrinterManufacturer(item) {
  const haystack = `${item?.driverName || ""} ${item?.name || ""}`;
  for (const { label, pattern } of MANUFACTURER_PATTERNS) {
    if (pattern.test(haystack)) return label;
  }
  return "Nepoznato";
}

// Groups ALREADY annotated rows (each must have .manufacturer) by brand,
// sorted by computer count descending.
export function groupByManufacturer(annotatedItems) {
  const map = new Map();
  for (const item of annotatedItems) {
    if (!map.has(item.manufacturer)) map.set(item.manufacturer, []);
    map.get(item.manufacturer).push(item);
  }
  return [...map.entries()]
    .map(([manufacturer, computers]) => ({ manufacturer, count: computers.length, computers }))
    .sort((a, b) => b.count - a.count || a.manufacturer.localeCompare(b.manufacturer));
}
