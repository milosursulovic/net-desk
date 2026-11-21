import ExcelJS from "exceljs";

/**
 * Sends an XLSX file as the response, based on exceljs (the only export library
 * after the refactor - replaces the earlier mix of the `xlsx` and `exceljs` packages).
 *
 * sheets: [{ name, columns, rows }]
 *   - columns: exceljs column defs, e.g. [{ header: "IP", key: "ip", width: 14 }]
 *   - rows: an array of objects whose keys match `key` from columns
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
