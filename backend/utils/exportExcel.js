import ExcelJS from "exceljs";

/**
 * Šalje XLSX fajl kao response, na bazi exceljs (jedina export biblioteka
 * posle refaktora - zamenjuje ranije mešanje `xlsx` i `exceljs` paketa).
 *
 * sheets: [{ name, columns, rows }]
 *   - columns: exceljs column defs, npr. [{ header: "IP", key: "ip", width: 14 }]
 *   - rows: niz objekata čiji ključevi odgovaraju `key` iz columns
 */
export async function sendXlsxExport(res, { filename, sheets }) {
  const workbook = new ExcelJS.Workbook();

  for (const { name, columns, rows } of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns;
    for (const row of rows) sheet.addRow(row);
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
}
