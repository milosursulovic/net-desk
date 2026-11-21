import { notFound } from "../utils/httpError.js";
import { parseDateMaybe } from "../utils/dates.js";
import { sanitizeText } from "../utils/strings.js";

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

// matched_flagged_id (the raw MIN(id) from the query, null when nothing matches) is
// mapped to is_flagged (boolean, the same contract as before exceptions were introduced -
// IpPdsuView.vue already reads item.is_flagged) + matchedFlaggedId (camelCase,
// new - the frontend sends it back to add an exception for EXACTLY the rule that
// currently matches, not for "something, who knows what").
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

    // sanitizeText: some driver installers (e.g. BIXOLON) write fixed-
    // size buffers into the registry without a proper null terminator - the agent
    // sends that as hundreds of "\0" bytes after the real value, which live
    // broke the insert against varchar(100)/varchar(255) columns (seen as
    // "Data too long" on display_version). The lengths here follow the actual column
    // width (backend/repositories/pdsu.repo.js's computerSoftwareInsert →
    // computer_software schema).
    display_name: sanitizeText(item.displayName, 255),

    display_version: sanitizeText(item.displayVersion, 100),

    publisher: sanitizeText(item.publisher, 255),

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

    // sanitizeText - see the comment in syncComputerSoftware, the same problem
    // (driver registry values with null-byte padding) affects these
    // fields too, the lengths follow the computer_drivers schema.
    device_name: sanitizeText(item.deviceName, 255),

    driver_version: sanitizeText(item.driverVersion, 100),

    driver_date: parseDateMaybe(item.driverDate),

    manufacturer: sanitizeText(item.manufacturer, 255),

    driver_provider_name: sanitizeText(item.driverProviderName, 255),
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

    // sanitizeText - see the comment in syncComputerSoftware. path_name is TEXT
    // (no practical limit), but it's still worth stripping the null-byte garbage.
    name: sanitizeText(item.name, 150),

    display_name: sanitizeText(item.displayName, 255),

    state: sanitizeText(item.state, 50),

    start_mode: sanitizeText(item.startMode, 50),

    start_name: sanitizeText(item.startName, 255),

    path_name: sanitizeText(item.pathName),
  }));

  await computerServicesInsert(rows);

  return true;
}

// =========================
// Blacklist exceptions (per computer) - "this is NOT unwanted on THIS
// computer", doesn't touch the global flag for everyone else. FLAG_EXCEPTION_ADDERS/
// _REMOVERS/_LISTERS are maps by "kind" (software/services/drivers) - one
// place that picks the right repo function instead of three nearly identical service
// functions per type.
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

    // sanitizeText - see the comment in syncComputerSoftware.
    description: sanitizeText(item.description, 100),

    hotfix_id: sanitizeText(item.hotFixID, 50),

    installed_on: parseDateMaybe(item.installedOn),

    installed_by: sanitizeText(item.installedBy, 255),
  }));

  await computerUpdatesInsert(rows);

  return true;
}

// Software/drivers/services/updates - deliberately NOT printers/available-updates
// (a separate concern, the user doesn't want "clear PDSU" to unintentionally delete those too).
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
// Printers (agent-detected, per computer)
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

    // sanitizeText - see the comment in syncComputerSoftware.
    name: sanitizeText(item.name, 255),

    driver_name: sanitizeText(item.driverName, 255),

    port_name: sanitizeText(item.portName, 255),

    status: sanitizeText(item.status, 50),

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

    // sanitizeText - see the comment in syncComputerSoftware.
    kb_id: sanitizeText(item.kbId, 50),

    title: sanitizeText(item.title, 500),

    severity: sanitizeText(item.severity, 50),
  }));

  await computerAvailableUpdatesInsert(rows);

  return true;
}
