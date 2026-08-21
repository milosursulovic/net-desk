import { parseIdParam } from "../utils/idParam.js";
import { toInt, clamp } from "../utils/numbers.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { listEventLogsService } from "../services/eventLogs.service.js";
import { sendMultiTablePdf } from "../utils/pdfTable.js";

import {
  listComputers,
  getComputer,
  getComputerSoftware,
  getComputerDrivers,
  getComputerServices,
  getComputerUpdates,
  syncComputerSoftware,
  syncComputerDrivers,
  syncComputerServices,
  syncComputerUpdates,
  getComputerByIp,
  getComputerPrinters,
  syncComputerPrinters,
  getComputerAvailableUpdates,
  syncComputerAvailableUpdates,
  clearComputerPdsu,
  addFlaggedExceptionService,
  removeFlaggedExceptionService,
  listFlaggedExceptionsService,
} from "../services/pdsu.service.js";

// =========================
// Computers
// =========================

export async function listComputersController(req, res) {
  const result = await listComputers(req.query);

  res.json(result);
}

export async function getComputerByIpController(req, res) {
  const { ip } = req.params;

  const computer = await getComputerByIp(ip);

  if (!computer) {
    throw notFound("Racunar nije pronadjen.");
  }

  res.json(computer);
}

export async function getComputerController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const computer = await getComputer(id);

  if (!computer) {
    throw notFound("Racunar nije pronadjen.");
  }

  res.json(computer);
}

export async function clearPdsuController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  await clearComputerPdsu(id);

  res.json({ success: true, message: "PDSU podaci obrisani." });
}

// mysql2 returns DATE/DATETIME columns as JS Date objects - pdfTable.js's
// row rendering just does String(value), which for a raw Date produces a
// verbose "Tue Jul 28 2026 00:00:00 GMT+..." string. Format the known date
// fields up front instead.
function fmtRowDates(rows, dateKeys) {
  return rows.map((row) => {
    const out = { ...row };
    for (const key of dateKeys) {
      if (out[key] instanceof Date) out[key] = out[key].toLocaleDateString("sr-RS");
    }
    return out;
  });
}

export async function exportComputerPdsuPdfController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const [computer, software, drivers, services, updates, printers] = await Promise.all([
    getComputer(id),
    getComputerSoftware(id),
    getComputerDrivers(id),
    getComputerServices(id),
    getComputerUpdates(id),
    getComputerPrinters(id),
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);

  sendMultiTablePdf(res, {
    title: `NetDesk — PDSU: ${computer.computer_name || computer.ip}`,
    subtitle: `IP: ${computer.ip}   Odeljenje: ${computer.department || "—"}   Generisano: ${dateStamp}`,
    filename: `NetDesk_PDSU_${computer.computer_name || computer.ip}_${dateStamp}.pdf`,
    sections: [
      {
        // Širine moraju stati u ~762pt korisne širine A4 landscape stranice
        // (pdfTable.js ne prelama/skalira kolone automatski) - ova sekcija
        // je ranije sabirala na 820pt, pa je poslednja kolona padala van stranice.
        heading: `Programi (${software.length})`,
        columns: [
          { header: "Program", key: "display_name", width: 200 },
          { header: "Verzija", key: "display_version", width: 110 },
          { header: "Izdavač", key: "publisher", width: 160 },
          { header: "Datum instalacije", key: "install_date", width: 130 },
          { header: "Datum inventara", key: "inventory_date", width: 130 },
        ],
        rows: fmtRowDates(software, ["install_date", "inventory_date"]),
        emptyText: "Nema podataka o instaliranom softveru.",
      },
      {
        // Isto - ranije 800pt, poslednja kolona padala van stranice.
        heading: `Drajveri (${drivers.length})`,
        columns: [
          { header: "Uređaj", key: "device_name", width: 200 },
          { header: "Verzija drajvera", key: "driver_version", width: 120 },
          { header: "Datum drajvera", key: "driver_date", width: 110 },
          { header: "Proizvođač", key: "manufacturer", width: 140 },
          { header: "Provider", key: "driver_provider_name", width: 140 },
        ],
        rows: fmtRowDates(drivers, ["driver_date"]),
        emptyText: "Nema podataka o drajverima.",
      },
      {
        heading: `Servisi (${services.length})`,
        columns: [
          { header: "Naziv", key: "name", width: 160 },
          { header: "Prikazni naziv", key: "display_name", width: 200 },
          { header: "Status", key: "state", width: 90 },
          { header: "Način pokretanja", key: "start_mode", width: 110 },
          { header: "Nalog", key: "start_name", width: 160 },
        ],
        rows: services,
        emptyText: "Nema podataka o servisima.",
      },
      {
        heading: `Ažuriranja (${updates.length})`,
        columns: [
          { header: "KB", key: "hotfix_id", width: 110 },
          { header: "Opis", key: "description", width: 260 },
          { header: "Datum instalacije", key: "installed_on", width: 140 },
          { header: "Instalirao", key: "installed_by", width: 160 },
        ],
        rows: fmtRowDates(updates, ["installed_on"]),
        emptyText: "Nema podataka o Windows ažuriranjima.",
      },
      {
        heading: `Štampači (${printers.length})`,
        columns: [
          { header: "Naziv", key: "name", width: 200 },
          { header: "Drajver", key: "driver_name", width: 180 },
          { header: "Port", key: "port_name", width: 120 },
          { header: "Status", key: "status", width: 100 },
          { header: "Podrazumevani", key: "is_default", width: 100 },
        ],
        rows: printers.map((p) => ({ ...p, is_default: p.is_default ? "Da" : "Ne" })),
        emptyText: "Nema podataka o štampačima.",
      },
    ],
  });
}

// =========================
// Software
// =========================

export async function getSoftwareController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const software = await getComputerSoftware(id);

  res.json(software);
}

export async function syncSoftwareController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const software = req.body.software;

  if (!Array.isArray(software)) {
    throw badRequest("Software mora biti niz.");
  }

  await syncComputerSoftware(id, software);

  res.json({
    success: true,
    message: "Software inventar sinhronizovan.",
  });
}

// =========================
// Drivers
// =========================

export async function getDriversController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const drivers = await getComputerDrivers(id);

  res.json(drivers);
}

export async function syncDriversController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const drivers = req.body.drivers;

  if (!Array.isArray(drivers)) {
    throw badRequest("Drivers mora biti niz.");
  }

  await syncComputerDrivers(id, drivers);

  res.json({
    success: true,
    message: "Driver inventar sinhronizovan.",
  });
}

// =========================
// Services
// =========================

export async function getServicesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const services = await getComputerServices(id);

  res.json(services);
}

export async function syncServicesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const services = req.body.services;

  if (!Array.isArray(services)) {
    throw badRequest("Services mora biti niz.");
  }

  await syncComputerServices(id, services);

  res.json({
    success: true,
    message: "Services inventar sinhronizovan.",
  });
}

// =========================
// Printers
// =========================

export async function getPrintersController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const printers = await getComputerPrinters(id);

  res.json(printers);
}

export async function syncPrintersController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const printers = req.body.printers;

  if (!Array.isArray(printers)) {
    throw badRequest("Printers mora biti niz.");
  }

  await syncComputerPrinters(id, printers);

  res.json({
    success: true,
    message: "Printer inventar sinhronizovan.",
  });
}

// =========================
// Izuzeci od crne liste (po računaru)
// =========================

const FLAG_KINDS = ["software", "services", "drivers"];

function parseKindParam(req) {
  const kind = req.params.kind;
  if (!FLAG_KINDS.includes(kind)) {
    throw badRequest("Nepoznat tip (software/services/drivers)");
  }
  return kind;
}

export async function listFlaggedExceptionsController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");
  const out = await listFlaggedExceptionsService(id);
  res.json(out);
}

export async function addFlaggedExceptionController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");
  const kind = parseKindParam(req);
  const flaggedId = parseIdParam(req, "flaggedId", "ID stavke na crnoj listi");

  const out = await addFlaggedExceptionService(id, kind, flaggedId, req.user?.userId ?? null);
  res.json(out);
}

export async function removeFlaggedExceptionController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");
  const kind = parseKindParam(req);
  const flaggedId = parseIdParam(req, "flaggedId", "ID stavke na crnoj listi");

  const out = await removeFlaggedExceptionService(id, kind, flaggedId);
  res.json(out);
}

// =========================
// Event Log
// =========================

export async function getEventLogsController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 500);
  const logName = ["System", "Application", "Security"].includes(req.query.logName)
    ? req.query.logName
    : undefined;
  const level = typeof req.query.level === "string" ? req.query.level : undefined;

  const out = await listEventLogsService(id, { page, limit, logName, level });
  res.json(out);
}

// =========================
// Available Updates
// =========================

export async function getAvailableUpdatesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const availableUpdates = await getComputerAvailableUpdates(id);

  res.json(availableUpdates);
}

export async function syncAvailableUpdatesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const availableUpdates = req.body.availableUpdates;

  if (!Array.isArray(availableUpdates)) {
    throw badRequest("AvailableUpdates mora biti niz.");
  }

  await syncComputerAvailableUpdates(id, availableUpdates);

  res.json({
    success: true,
    message: "Dostupne zakrpe sinhronizovane.",
  });
}

// =========================
// Updates
// =========================

export async function getUpdatesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const updates = await getComputerUpdates(id);

  res.json(updates);
}

export async function syncUpdatesController(req, res) {
  const id = parseIdParam(req, "id", "ID racunara");

  const updates = req.body.updates;

  if (!Array.isArray(updates)) {
    throw badRequest("Updates mora biti niz.");
  }

  await syncComputerUpdates(id, updates);

  res.json({
    success: true,
    message: "Windows update inventar sinhronizovan.",
  });
}
