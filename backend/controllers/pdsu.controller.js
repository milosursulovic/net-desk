import { toInt } from "../utils/numbers.js";

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
    return res.status(404).json({
      error: "Racunar nije pronadjen.",
    });
  }

  res.json(computer);
}

export async function getComputerController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const computer = await getComputer(id);

  if (!computer) {
    return res.status(404).json({
      error: "Racunar nije pronadjen.",
    });
  }

  res.json(computer);
}

// =========================
// Software
// =========================

export async function getSoftwareController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const software = await getComputerSoftware(id);

  res.json(software);
}

export async function syncSoftwareController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const software = req.body.software;

  if (!Array.isArray(software)) {
    return res.status(400).json({
      error: "Software mora biti niz.",
    });
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
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const drivers = await getComputerDrivers(id);

  res.json(drivers);
}

export async function syncDriversController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const drivers = req.body.drivers;

  if (!Array.isArray(drivers)) {
    return res.status(400).json({
      error: "Drivers mora biti niz.",
    });
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
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const services = await getComputerServices(id);

  res.json(services);
}

export async function syncServicesController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const services = req.body.services;

  if (!Array.isArray(services)) {
    return res.status(400).json({
      error: "Services mora biti niz.",
    });
  }

  await syncComputerServices(id, services);

  res.json({
    success: true,
    message: "Services inventar sinhronizovan.",
  });
}

// =========================
// Updates
// =========================

export async function getUpdatesController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const updates = await getComputerUpdates(id);

  res.json(updates);
}

export async function syncUpdatesController(req, res) {
  const id = toInt(req.params.id);

  if (!id) {
    return res.status(400).json({
      error: "Neispravan ID racunara.",
    });
  }

  const updates = req.body.updates;

  if (!Array.isArray(updates)) {
    return res.status(400).json({
      error: "Updates mora biti niz.",
    });
  }

  await syncComputerUpdates(id, updates);

  res.json({
    success: true,
    message: "Windows update inventar sinhronizovan.",
  });
}
