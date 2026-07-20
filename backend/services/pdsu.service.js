import { notFound } from "../utils/httpError.js";

import {
  computerFindById,
  computerList,
  computerSoftwareList,
  computerDriversList,
  computerServicesList,
  computerUpdatesList,
  computerSoftwareDelete,
  computerSoftwareInsert,
  computerDriversDelete,
  computerDriversInsert,
  computerServicesDelete,
  computerServicesInsert,
  computerUpdatesDelete,
  computerUpdatesInsert,
  computerFindByIp,
  computerPrintersList,
  computerPrintersDelete,
  computerPrintersInsert,
  computerAvailableUpdatesList,
  computerAvailableUpdatesDelete,
  computerAvailableUpdatesInsert,
} from "../repositories/pdsu.repo.js";

// =========================
// Computers
// =========================

export async function listComputers(query) {
  return await computerList(query);
}

export async function getComputerByIp(ip) {
  return await computerFindByIp(ip);
}

export async function getComputer(id) {
  const computer = await computerFindById(id);

  if (!computer) {
    throw notFound("Racunar nije pronadjen.");
  }

  return computer;
}

// =========================
// Software
// =========================

export async function getComputerSoftware(id) {
  return await computerSoftwareList(id);
}

export async function syncComputerSoftware(ipEntryId, software) {
  await getComputer(ipEntryId);

  await computerSoftwareDelete(ipEntryId);

  if (!software.length) {
    return true;
  }

  const rows = software.map((item) => ({
    ip_entry_id: ipEntryId,

    display_name: item.displayName ?? null,

    display_version: item.displayVersion ?? null,

    publisher: item.publisher ?? null,

    install_date: item.installDate ?? null,
  }));

  await computerSoftwareInsert(rows);

  return true;
}

// =========================
// Drivers
// =========================

export async function getComputerDrivers(id) {
  return await computerDriversList(id);
}

export async function syncComputerDrivers(ipEntryId, drivers) {
  await getComputer(ipEntryId);

  await computerDriversDelete(ipEntryId);

  if (!drivers.length) {
    return true;
  }

  const rows = drivers.map((item) => ({
    ip_entry_id: ipEntryId,

    device_name: item.deviceName ?? null,

    driver_version: item.driverVersion ?? null,

    driver_date: item.driverDate ?? null,

    manufacturer: item.manufacturer ?? null,

    driver_provider_name: item.driverProviderName ?? null,
  }));

  await computerDriversInsert(rows);

  return true;
}

// =========================
// Services
// =========================

export async function getComputerServices(id) {
  return await computerServicesList(id);
}

export async function syncComputerServices(ipEntryId, services) {
  await getComputer(ipEntryId);

  await computerServicesDelete(ipEntryId);

  if (!services.length) {
    return true;
  }

  const rows = services.map((item) => ({
    ip_entry_id: ipEntryId,

    name: item.name ?? null,

    display_name: item.displayName ?? null,

    state: item.state ?? null,

    start_mode: item.startMode ?? null,

    start_name: item.startName ?? null,

    path_name: item.pathName ?? null,
  }));

  await computerServicesInsert(rows);

  return true;
}

// =========================
// Updates
// =========================

export async function getComputerUpdates(id) {
  return await computerUpdatesList(id);
}

export async function syncComputerUpdates(ipEntryId, updates) {
  await getComputer(ipEntryId);

  await computerUpdatesDelete(ipEntryId);

  if (!updates.length) {
    return true;
  }

  const rows = updates.map((item) => ({
    ip_entry_id: ipEntryId,

    description: item.description ?? null,

    hotfix_id: item.hotFixID ?? null,

    installed_on: item.installedOn ?? null,

    installed_by: item.installedBy ?? null,
  }));

  await computerUpdatesInsert(rows);

  return true;
}

// =========================
// Printers (agent-detektovani, po računaru)
// =========================

export async function getComputerPrinters(id) {
  return await computerPrintersList(id);
}

export async function syncComputerPrinters(ipEntryId, printers) {
  await getComputer(ipEntryId);

  await computerPrintersDelete(ipEntryId);

  if (!printers.length) {
    return true;
  }

  const rows = printers.map((item) => ({
    ip_entry_id: ipEntryId,

    name: item.name ?? null,

    driver_name: item.driverName ?? null,

    port_name: item.portName ?? null,

    status: item.status ?? null,

    is_default: item.isDefault ? 1 : 0,
  }));

  await computerPrintersInsert(rows);

  return true;
}

// =========================
// Available Updates (dostupne, neinstalirane zakrpe)
// =========================

export async function getComputerAvailableUpdates(id) {
  return await computerAvailableUpdatesList(id);
}

export async function syncComputerAvailableUpdates(ipEntryId, availableUpdates) {
  await getComputer(ipEntryId);

  await computerAvailableUpdatesDelete(ipEntryId);

  if (!availableUpdates.length) {
    return true;
  }

  const rows = availableUpdates.map((item) => ({
    ip_entry_id: ipEntryId,

    kb_id: item.kbId ?? null,

    title: item.title ?? null,

    severity: item.severity ?? null,
  }));

  await computerAvailableUpdatesInsert(rows);

  return true;
}
