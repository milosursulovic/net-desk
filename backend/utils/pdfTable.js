import PDFDocument from "pdfkit";
import { FONT_REGULAR, FONT_BOLD } from "./pdfFonts.js";

/**
 * Draws one "header row + data rows" table at the current doc.y, with
 * manual page-break handling (pdfkit has no built-in table support) -
 * checks doc.y against the bottom margin before each row and repeats the
 * column header on a new page. Shared by sendTablePdf (one table per
 * document) and sendMultiTablePdf (several tables/sections in one document).
 */
function drawTable(doc, startX, usableWidth, { columns, rows, emptyText }) {
  const rowHeight = 16;

  function drawHeader() {
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

  drawHeader();

  if (!rows.length) {
    doc.fillColor("#64748b");
    doc.text(emptyText || "Nema podataka.", startX);
    doc.fillColor("#111111");
    return;
  }

  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
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
}

function drawTitleBlock(doc, startX, title, subtitle) {
  doc.font("Bold").fontSize(16).fillColor("#1e293b");
  doc.text(title, startX, doc.y);
  if (subtitle) {
    doc.font("Regular").fontSize(9).fillColor("#64748b");
    doc.text(subtitle, startX);
  }
  doc.fillColor("#111111");
  doc.moveDown(0.8);
}

/**
 * Generički pdfkit "header + tabela" export - lista bez X (bez metapodataka,
 * bez PDSU, bez agenta).
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

  drawTitleBlock(doc, startX, title, subtitle);
  drawTable(doc, startX, usableWidth, { columns, rows, emptyText });

  doc.end();
}

/**
 * Same as sendTablePdf, but for several labeled sections in one document -
 * used for a single computer's full PDSU export (software/drivers/
 * services/updates, one table each).
 *
 * sections: [{ heading, columns, rows, emptyText }]
 */
export function sendMultiTablePdf(res, { title, subtitle, filename, sections }) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  doc.registerFont("Regular", FONT_REGULAR);
  doc.registerFont("Bold", FONT_BOLD);
  doc.font("Regular");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  drawTitleBlock(doc, startX, title, subtitle);

  for (const section of sections) {
    doc.font("Bold").fontSize(12).fillColor("#1e293b");
    doc.text(section.heading, startX);
    doc.font("Regular").fontSize(9).fillColor("#111111");
    doc.moveDown(0.4);

    drawTable(doc, startX, usableWidth, {
      columns: section.columns,
      rows: section.rows,
      emptyText: section.emptyText,
    });
    doc.moveDown(0.8);
  }

  doc.end();
}
