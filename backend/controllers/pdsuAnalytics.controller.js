import {
  pdsuAnalyticsStatsService,
  exportPdsuAnalyticsXlsx,
  searchPdsuAnalytics,
  listComputersWithoutPdsuService,
  listComputersWithoutUltravncService,
} from "../services/pdsuAnalytics.service.js";
import { sendXlsxExport } from "../utils/exportExcel.js";
import { sendTablePdf } from "../utils/pdfTable.js";

export async function pdsuAnalyticsStatsController(req, res) {
  const result = await pdsuAnalyticsStatsService();

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

export async function listWithoutPdsuController(req, res) {
  const result = await listComputersWithoutPdsuService();

  res.json(result);
}

export async function exportWithoutPdsuPdfController(req, res) {
  const { items } = await listComputersWithoutPdsuService();
  const dateStamp = new Date().toISOString().slice(0, 10);

  sendTablePdf(res, {
    title: "NetDesk — Računari bez PDSU podataka",
    subtitle: `Nema nijedan zapis (programi/drajveri/servisi/update-i) — ukupno: ${items.length}, generisano ${dateStamp}`,
    filename: `NetDesk_bez_PDSU_${dateStamp}.pdf`,
    columns: [
      { header: "Računar", key: "computerName", width: 180 },
      { header: "IP", key: "ip", width: 110 },
      { header: "Odeljenje", key: "department", width: 160 },
      { header: "OS", key: "os", width: 220 },
    ],
    rows: items,
    emptyText: "Svi računari imaju bar neki PDSU podatak.",
  });
}

export async function listWithoutUltravncController(req, res) {
  const result = await listComputersWithoutUltravncService();

  res.json(result);
}

export async function exportWithoutUltravncPdfController(req, res) {
  const { items } = await listComputersWithoutUltravncService();
  const dateStamp = new Date().toISOString().slice(0, 10);

  sendTablePdf(res, {
    title: "NetDesk — Računari bez UltraVNC",
    subtitle: `Nema servis nalik UltraVNC u servis inventaru — ukupno: ${items.length}, generisano ${dateStamp}`,
    filename: `NetDesk_bez_UltraVNC_${dateStamp}.pdf`,
    columns: [
      { header: "Računar", key: "computerName", width: 160 },
      { header: "IP", key: "ip", width: 100 },
      { header: "Odeljenje", key: "department", width: 140 },
      { header: "OS", key: "os", width: 200 },
      { header: "Status", key: "onlineLabel", width: 80 },
      { header: "Agent", key: "agentLabel", width: 100 },
    ],
    rows: items.map((r) => ({
      ...r,
      onlineLabel: r.isOnline ? "Online" : "Offline",
      agentLabel: r.agentId ? "Ima agenta" : "Nema agenta",
    })),
    emptyText: "Svi računari imaju UltraVNC servis.",
  });
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
