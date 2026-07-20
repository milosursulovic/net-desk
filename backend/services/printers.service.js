import { emptyToNull } from "../utils/strings.js";
import { isValidIPv4, ipToNumeric } from "../utils/ip.js";
import { pool } from "../db/pool.js";
import { paginate } from "../utils/pagination.js";
import { notFound } from "../utils/httpError.js";
import {
  getPrinterById,
  listPrinters,
  insertPrinter,
  updatePrinterFields,
  deletePrinter,
  setPrinterHost,
  unsetPrinterHost,
  connectPrinterComputer,
  disconnectPrinterComputer,
  updateSharedFromConnections,
  exportPrintersData,
} from "../repositories/printers.repo.js";

async function findIpEntryByIpOrId(ipOrId) {
  const v = String(ipOrId || "").trim();
  if (!v) return null;

  if (isValidIPv4(v)) {
    const [[row]] = await pool.execute(
      `SELECT id, ip, computer_name AS computerName, username, department
       FROM ip_entries
       WHERE ip = ?
       LIMIT 1`,
      [v],
    );
    return row || null;
  }

  if (/^\d+$/.test(v)) {
    const asId = Number(v);
    if (asId > 0) {
      const [[row]] = await pool.execute(
        `SELECT id, ip, computer_name AS computerName, username, department
         FROM ip_entries
         WHERE id = ?
         LIMIT 1`,
        [asId],
      );
      return row || null;
    }
  }

  return null;
}

export async function listPrintersService({ page, limit, search }) {
  const { items, total } = await listPrinters({ page, limit, search });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, search, total, totalPages };
}

export async function getPrinterService(id) {
  const p = await getPrinterById(id);
  if (!p) {
    throw notFound("Printer not found");
  }
  return p;
}

export async function createPrinterService(body) {
  const ip = emptyToNull(body.ip);
  const ipNumeric = ip && isValidIPv4(ip) ? ipToNumeric(ip) : null;

  const row = {
    name: emptyToNull(body.name),
    manufacturer: emptyToNull(body.manufacturer),
    model: emptyToNull(body.model),
    serial: emptyToNull(body.serial),
    department: emptyToNull(body.department),
    connectionType: emptyToNull(body.connectionType) ?? "Network",
    ip,
    ipNumeric,
    shared: body.shared ? 1 : 0,
    hostComputerId: body.hostComputerId ?? null,
  };

  const id = await insertPrinter(row);
  return await getPrinterById(id);
}

export async function updatePrinterService(id, body) {
  const fields = [];
  const params = [];
  const setIf = (col, val) => {
    fields.push(`${col} = ?`);
    params.push(val);
  };

  if ("name" in body) setIf("name", emptyToNull(body.name));
  if ("manufacturer" in body)
    setIf("manufacturer", emptyToNull(body.manufacturer));
  if ("model" in body) setIf("model", emptyToNull(body.model));
  if ("serial" in body) setIf("serial", emptyToNull(body.serial));
  if ("department" in body) setIf("department", emptyToNull(body.department));
  if ("connectionType" in body)
    setIf("connection_type", emptyToNull(body.connectionType) ?? "Network");

  if ("ip" in body) {
    const ip = emptyToNull(body.ip);
    setIf("ip", ip);
    setIf("ip_numeric", ip && isValidIPv4(ip) ? ipToNumeric(ip) : null);
  }

  if ("shared" in body) setIf("shared", body.shared ? 1 : 0);
  if ("hostComputerId" in body)
    setIf("host_computer_id", body.hostComputerId ?? null);

  if (fields.length === 0) {
    return await getPrinterService(id);
  }

  const affected = await updatePrinterFields(id, fields.join(", "), params);
  if (!affected) {
    throw notFound("Printer not found");
  }

  return await getPrinterById(id);
}

export async function deletePrinterService(id) {
  const affected = await deletePrinter(id);
  if (!affected) {
    throw notFound("Printer not found");
  }
  return true;
}

export async function setHostService(printerId, computer) {
  const host = await findIpEntryByIpOrId(computer);
  if (!host) {
    throw notFound("Host computer not found (use IPv4 or numeric id)");
  }

  const affected = await setPrinterHost(printerId, host.id);
  if (!affected) {
    throw notFound("Printer not found");
  }

  return await getPrinterById(printerId);
}

export async function unsetHostService(printerId) {
  const affected = await unsetPrinterHost(printerId);
  if (!affected) {
    throw notFound("Printer not found");
  }
  return await getPrinterById(printerId);
}

export async function connectComputerService(printerId, computer) {
  const pc = await findIpEntryByIpOrId(computer);
  if (!pc) {
    throw notFound("Computer not found (use IPv4 or numeric id)");
  }

  await connectPrinterComputer(printerId, pc.id);

  const updated = await getPrinterById(printerId);
  if (!updated) {
    throw notFound("Printer not found");
  }
  return updated;
}

export async function disconnectComputerService(printerId, computer) {
  const pc = await findIpEntryByIpOrId(computer);
  if (!pc) {
    throw notFound("Computer not found (use IPv4 or numeric id)");
  }

  await disconnectPrinterComputer(printerId, pc.id);
  await updateSharedFromConnections(printerId);

  const updated = await getPrinterById(printerId);
  if (!updated) {
    throw notFound("Printer not found");
  }
  return updated;
}

export async function exportPrintersService(search) {
  return await exportPrintersData(search);
}
