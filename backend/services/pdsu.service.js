import { notFound } from "../utils/httpError.js";
import { parseDateMaybe } from "../utils/dates.js";

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
import {
  addFlaggedSoftwareException,
  removeFlaggedSoftwareException,
  listFlaggedSoftwareExceptionsForIpEntry,
  addFlaggedServiceException,
  removeFlaggedServiceException,
  listFlaggedServiceExceptionsForIpEntry,
  addFlaggedDriverException,
  removeFlaggedDriverException,
  listFlaggedDriverExceptionsForIpEntry,
} from "../repositories/flagged.repo.js";
import { badRequest } from "../utils/httpError.js";

// matched_flagged_id (sirov MIN(id) iz upita, null kad ništa ne poklapa) se
// mapira u is_flagged (boolean, isti ugovor kao pre uvođenja izuzetaka -
// IpPdsuView.vue već čita item.is_flagged) + matchedFlaggedId (camelCase,
// novo - frontend ga šalje nazad da doda izuzetak za TAČNO to pravilo koje
// trenutno pogađa, ne za "nešto, ko zna šta").
function mapFlaggableRow(row) {
  const { matched_flagged_id, ...rest } = row;
  return { ...rest, is_flagged: matched_flagged_id != null, matchedFlaggedId: matched_flagged_id };
}

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
  const rows = await computerSoftwareList(id);
  return rows.map(mapFlaggableRow);
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

    install_date: parseDateMaybe(item.installDate),
  }));

  await computerSoftwareInsert(rows);

  return true;
}

// =========================
// Drivers
// =========================

export async function getComputerDrivers(id) {
  const rows = await computerDriversList(id);
  return rows.map(mapFlaggableRow);
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

    driver_date: parseDateMaybe(item.driverDate),

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
  const rows = await computerServicesList(id);
  return rows.map(mapFlaggableRow);
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
// Izuzeci od crne liste (po računaru) - "ovo NIJE neželjeno na OVOM
// računaru", ne dira globalni flag za sve ostale. FLAG_EXCEPTION_ADDERS/
// _REMOVERS/_LISTERS su mape po "kind" (software/services/drivers) - jedno
// mesto koje bira pravu repo funkciju umesto tri skoro-identične service
// funkcije po tipu.
// =========================

const FLAG_KINDS = ["software", "services", "drivers"];

const EXCEPTION_ADDERS = {
  software: addFlaggedSoftwareException,
  services: addFlaggedServiceException,
  drivers: addFlaggedDriverException,
};
const EXCEPTION_REMOVERS = {
  software: removeFlaggedSoftwareException,
  services: removeFlaggedServiceException,
  drivers: removeFlaggedDriverException,
};
const EXCEPTION_LISTERS = {
  software: listFlaggedSoftwareExceptionsForIpEntry,
  services: listFlaggedServiceExceptionsForIpEntry,
  drivers: listFlaggedDriverExceptionsForIpEntry,
};

export async function addFlaggedExceptionService(ipEntryId, kind, flaggedId, createdByUserId) {
  await getComputer(ipEntryId);
  if (!FLAG_KINDS.includes(kind)) {
    throw badRequest("Nepoznat tip (software/services/drivers)");
  }
  await EXCEPTION_ADDERS[kind](flaggedId, ipEntryId, createdByUserId);
  return { success: true };
}

export async function removeFlaggedExceptionService(ipEntryId, kind, flaggedId) {
  if (!FLAG_KINDS.includes(kind)) {
    throw badRequest("Nepoznat tip (software/services/drivers)");
  }
  const affected = await EXCEPTION_REMOVERS[kind](flaggedId, ipEntryId);
  if (!affected) {
    throw notFound("Izuzetak nije pronađen");
  }
  return { success: true };
}

export async function listFlaggedExceptionsService(ipEntryId) {
  await getComputer(ipEntryId);
  const [software, services, drivers] = await Promise.all([
    EXCEPTION_LISTERS.software(ipEntryId),
    EXCEPTION_LISTERS.services(ipEntryId),
    EXCEPTION_LISTERS.drivers(ipEntryId),
  ]);
  return { software, services, drivers };
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

    installed_on: parseDateMaybe(item.installedOn),

    installed_by: item.installedBy ?? null,
  }));

  await computerUpdatesInsert(rows);

  return true;
}

// Software/drajveri/servisi/updates - namerno NE i printers/available-updates
// (odvojena briga, korisnik ne bi da "očisti PDSU" nenamerno obriše i njih).
export async function clearComputerPdsu(ipEntryId) {
  await getComputer(ipEntryId);

  await Promise.all([
    computerSoftwareDelete(ipEntryId),
    computerDriversDelete(ipEntryId),
    computerServicesDelete(ipEntryId),
    computerUpdatesDelete(ipEntryId),
    computerPrintersDelete(ipEntryId),
  ]);

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
