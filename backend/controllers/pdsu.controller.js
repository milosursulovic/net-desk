import { parseIdParam } from "../utils/idParam.js";
import { toInt, clamp } from "../utils/numbers.js";
import { badRequest, notFound } from "../utils/httpError.js";
import { listEventLogsService } from "../services/eventLogs.service.js";

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
