import { fileURLToPath } from "url";

// pdfkit's built-in Standard-14 fonts (Helvetica etc.) only support
// WinAnsiEncoding (cp1252), which is missing č/ć/đ (present: š/ž only) -
// srpska latinica silently renders as garbage without a real embedded
// Unicode font. DejaVu Sans has full Latin Extended-A coverage and a
// license that permits embedding/redistribution. Shared by every pdfkit
// export (reportPdf.js, pdfTable.js, metadataPdf.js) so the font paths
// live in exactly one place.
export const FONT_REGULAR = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
);
export const FONT_BOLD = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
);
