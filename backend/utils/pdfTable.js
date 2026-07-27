import PDFDocument from "pdfkit";
import { fileURLToPath } from "url";

// Isti font kao reportPdf.js - Standard-14 PDF fontovi ne pokrivaju č/ć/đ.
const FONT_REGULAR = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
);
const FONT_BOLD = fileURLToPath(
  import.meta.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf"),
);

/**
 * Generički pdfkit "header + tabela" export, reuse-ovan od strane svih
 * "lista bez X" PDF export-a (bez metapodataka, bez PDSU, bez agenta) -
 * pdfkit nema ugrađenu tabelu, pa se kolone crtaju ručno preko fiksnih
 * širina, sa ručnim page-break-om (proverava doc.y protiv donje margine
 * pre svakog reda, ponavlja header kolona na novoj strani).
 *
 * columns: [{ header, key, width }] (width u tačkama, suma <= širina strane)
 */
export function sendTablePdf(res, { title, subtitle, filename, columns, rows, emptyText }) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.registerFont("Regular", FONT_REGULAR);
  doc.registerFont("Bold", FONT_BOLD);
  doc.font("Regular");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowHeight = 16;

  function drawTableHeader() {
    doc.font("Bold").fontSize(9).fillColor("#1e293b");
    const y = doc.y;
    let x = startX;
    for (const col of columns) {
      doc.text(col.header, x, y, { width: col.width, ellipsis: true });
      x += col.width;
    }
    doc.moveDown(0.6);
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + usableWidth, doc.y)
      .strokeColor("#cbd5e1")
      .stroke();
    doc.moveDown(0.3);
    doc.font("Regular").fontSize(9).fillColor("#111111");
  }

  doc.font("Bold").fontSize(16).fillColor("#1e293b");
  doc.text(title, startX, doc.y);
  if (subtitle) {
    doc.font("Regular").fontSize(9).fillColor("#64748b");
    doc.text(subtitle, startX);
  }
  doc.fillColor("#111111");
  doc.moveDown(0.8);

  drawTableHeader();

  if (!rows.length) {
    doc.fillColor("#64748b");
    doc.text(emptyText || "Nema podataka.", startX);
  }

  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawTableHeader();
    }

    const y = doc.y;
    let x = startX;
    for (const col of columns) {
      const value = row[col.key];
      doc.text(value == null || value === "" ? "—" : String(value), x, y, {
        width: col.width,
        ellipsis: true,
      });
      x += col.width;
    }
    doc.moveDown(0.9);
  }

  doc.end();
}
