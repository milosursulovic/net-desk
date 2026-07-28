import PDFDocument from "pdfkit";
import { FONT_REGULAR, FONT_BOLD } from "./pdfFonts.js";

function fmtDate(d) {
  if (!d) return "—";
  const parsed = new Date(d);
  return isNaN(parsed) ? "—" : parsed.toLocaleString("sr-RS");
}

function safe(v) {
  return v == null || v === "" ? "—" : String(v);
}

function heading(doc, text) {
  doc.moveDown(0.8);
  doc.font("Bold").fontSize(13).fillColor("#1e293b");
  doc.text(text);
  doc.moveDown(0.2);
  doc.font("Regular").fontSize(10).fillColor("#111111");
}

function kv(doc, label, value) {
  doc.text(`${label}: ${safe(value)}`);
}

function bulletOrEmpty(doc, items, emptyText, toLine) {
  if (!items?.length) {
    doc.fillColor("#64748b");
    doc.text(emptyText);
    doc.fillColor("#111111");
    return;
  }
  for (const item of items) doc.text(`•  ${toLine(item)}`);
}

/**
 * Single-computer metadata export - mirrors the sections shown on
 * IpMetaView.vue (OS/System/CPU/RAM/Storage/GPU/NIC/BIOS), not a table
 * (metadataPdf's shape is nested key-value + lists, not tabular like
 * pdfTable.js's exports).
 */
export function sendMetadataPdf(res, { entry, meta }) {
  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.registerFont("Regular", FONT_REGULAR);
  doc.registerFont("Bold", FONT_BOLD);
  doc.font("Regular");

  const filename = `NetDesk_metapodaci_${entry.computerName || entry.ip || entry.id}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  doc.font("Bold").fontSize(18).fillColor("#1e293b");
  doc.text(`NetDesk — Metapodaci: ${entry.computerName || entry.ip}`);
  doc.font("Regular").fontSize(10).fillColor("#64748b");
  doc.text(`IP: ${entry.ip}   Odeljenje: ${safe(entry.department)}`);
  doc.text(`Generisano: ${fmtDate(new Date())}`);
  doc.fillColor("#111111");

  heading(doc, "Osnovno");
  kv(doc, "Računar", meta.ComputerName);
  kv(doc, "Korisnik", meta.UserName);
  kv(doc, "Prikupljeno", fmtDate(meta.CollectedAt));
  kv(doc, "Ažurirano", fmtDate(meta.updatedAt));

  heading(doc, "Operativni sistem");
  kv(doc, "Caption", meta.OS?.Caption);
  kv(doc, "Verzija", meta.OS?.Version);
  kv(doc, "Build", meta.OS?.Build);
  kv(doc, "Install date", fmtDate(meta.OS?.InstallDate));

  heading(doc, "Sistem");
  kv(doc, "Proizvođač", meta.System?.Manufacturer);
  kv(doc, "Model", meta.System?.Model);
  kv(doc, "RAM ukupno", meta.System?.TotalRAM_GB != null ? `${meta.System.TotalRAM_GB} GB` : "—");

  heading(doc, "CPU");
  kv(doc, "Naziv", meta.CPU?.Name);
  kv(doc, "Jezgra", meta.CPU?.Cores);
  kv(doc, "Logičkih", meta.CPU?.LogicalCPUs);
  kv(doc, "Max MHz", meta.CPU?.MaxClockMHz);
  kv(doc, "Socket", meta.CPU?.Socket);

  heading(doc, `RAM moduli (${meta.RAMModules?.length || 0})`);
  bulletOrEmpty(doc, meta.RAMModules, "Nema podataka.", (r) =>
    `Slot ${safe(r.Slot)} — ${[r.Manufacturer, r.PartNumber].filter(Boolean).join(" ") || "—"}, ` +
    `${r.CapacityGB ? r.CapacityGB + " GB" : "—"}, ${safe(r.SpeedMTps)} MT/s`,
  );

  heading(doc, `Diskovi (${meta.Storage?.length || 0})`);
  bulletOrEmpty(doc, meta.Storage, "Nema podataka.", (s) =>
    `${safe(s.Model)} — ${s.SizeGB ? s.SizeGB + " GB" : "—"}, ${safe(s.MediaType)}/${safe(s.BusType)}`,
  );

  heading(doc, `GPU (${meta.GPUs?.length || 0})`);
  bulletOrEmpty(doc, meta.GPUs, "Nema podataka.", (g) =>
    `${safe(g.Name)} — driver ${safe(g.DriverVers)}, VRAM ${g.VRAM_GB ? g.VRAM_GB + " GB" : "—"}`,
  );

  heading(doc, `Mreža (${meta.NICs?.length || 0})`);
  bulletOrEmpty(doc, meta.NICs, "Nema podataka.", (n) =>
    `${safe(n.Name)} — MAC ${safe(n.MAC)}, ${n.SpeedMbps ? n.SpeedMbps + " Mbps" : "—"}`,
  );

  heading(doc, "BIOS / Matična ploča");
  kv(doc, "BIOS Vendor", meta.BIOS?.Vendor);
  kv(doc, "BIOS Verzija", meta.BIOS?.Version);
  kv(doc, "BIOS Release", fmtDate(meta.BIOS?.ReleaseDate));
  kv(doc, "MB Proizvođač", meta.Motherboard?.Manufacturer);
  kv(doc, "MB Model", meta.Motherboard?.Product);
  kv(doc, "MB Serijski", meta.Motherboard?.Serial);

  doc.end();
}
