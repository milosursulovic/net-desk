import {
  inventoryAnalyticsStatsService,
  exportPdsuAnalyticsXlsx,
  searchPdsuAnalytics,
} from "../services/pdsuAnalytics.service.js";
import { sendXlsxExport } from "../utils/exportExcel.js";

export async function inventoryAnalyticsStatsController(req, res) {
  const result = await inventoryAnalyticsStatsService();

  res.json(result);
}

export async function searchPdsuAnalyticsController(req, res) {
  const category = String(req.query.category || "all");
  const term = String(req.query.q || "");

  const result = await searchPdsuAnalytics(category, term);

  if (category === "all") {
    return res.json(result);
  }

  res.json({ results: result });
}

export async function exportPdsuAnalyticsController(req, res) {
  const { software, drivers, services, updates } =
    await exportPdsuAnalyticsXlsx();

  const dateStamp = new Date().toISOString().slice(0, 10);

  await sendXlsxExport(res, {
    filename: `NetDesk_PDSU_${dateStamp}.xlsx`,
    sheets: [
      {
        name: "Programi",
        columns: [
          { header: "Računar", key: "computerName", width: 22 },
          { header: "IP", key: "ip", width: 14 },
          { header: "Odeljenje", key: "department", width: 18 },
          { header: "Program", key: "displayName", width: 30 },
          { header: "Verzija", key: "displayVersion", width: 18 },
          { header: "Izdavač", key: "publisher", width: 22 },
          { header: "Datum instalacije", key: "installDate", width: 18 },
          { header: "Datum inventara", key: "inventoryDate", width: 20 },
        ],
        rows: software,
      },
      {
        name: "Drajveri",
        columns: [
          { header: "Računar", key: "computerName", width: 22 },
          { header: "IP", key: "ip", width: 14 },
          { header: "Odeljenje", key: "department", width: 18 },
          { header: "Uređaj", key: "deviceName", width: 30 },
          { header: "Verzija drajvera", key: "driverVersion", width: 18 },
          { header: "Datum drajvera", key: "driverDate", width: 16 },
          { header: "Proizvođač", key: "manufacturer", width: 22 },
          { header: "Provider", key: "driverProviderName", width: 22 },
          { header: "Datum inventara", key: "inventoryDate", width: 20 },
        ],
        rows: drivers,
      },
      {
        name: "Servisi",
        columns: [
          { header: "Računar", key: "computerName", width: 22 },
          { header: "IP", key: "ip", width: 14 },
          { header: "Odeljenje", key: "department", width: 18 },
          { header: "Naziv", key: "name", width: 26 },
          { header: "Prikazni naziv", key: "displayName", width: 30 },
          { header: "Status", key: "state", width: 14 },
          { header: "Način pokretanja", key: "startMode", width: 16 },
          { header: "Nalog", key: "startName", width: 20 },
          { header: "Putanja", key: "pathName", width: 40 },
          { header: "Datum inventara", key: "inventoryDate", width: 20 },
        ],
        rows: services,
      },
      {
        name: "Updates",
        columns: [
          { header: "Računar", key: "computerName", width: 22 },
          { header: "IP", key: "ip", width: 14 },
          { header: "Odeljenje", key: "department", width: 18 },
          { header: "KB", key: "hotfixId", width: 14 },
          { header: "Opis", key: "description", width: 40 },
          { header: "Datum instalacije", key: "installedOn", width: 18 },
          { header: "Instalirao", key: "installedBy", width: 20 },
          { header: "Datum inventara", key: "inventoryDate", width: 20 },
        ],
        rows: updates,
      },
    ],
  });
}
