import { insertEventLogsBulk, listEventLogs } from "../repositories/eventLogs.repo.js";
import { paginate } from "../utils/pagination.js";

export async function ingestEventLogs(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries.map((item) => {
    // new Date(...) je namerno, ne sirov string - agent šalje ISO 8601 sa
    // 7 decimala sekunde i "Z" sufiksom (C#-ov DateTime.ToString("o")), što
    // MySQL DATETIME odbija direktno ("Incorrect datetime value" - Z sufiks
    // se nikad ne prihvata, a >6 decimala takođe ne - videti isti fix u
    // dnsLogs.service.js, otkriveno uživo baš na toj grani prvo). new Date()
    // parsira string ispravno, mysql2 zatim sam serijalizuje Date objekat.
    const loggedAt = item.loggedAt ? new Date(item.loggedAt) : new Date();

    return {
      ip_entry_id: ipEntryId,
      log_name: item.logName ?? "Application",
      level: item.level ?? null,
      source: item.source ?? null,
      event_id: item.eventId ?? null,
      message: item.message ?? null,
      logged_at: isNaN(loggedAt) ? new Date() : loggedAt,
    };
  });

  await insertEventLogsBulk(rows);
  return true;
}

export async function listEventLogsService(ipEntryId, { page, limit, logName, level }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listEventLogs({ ipEntryId, logName, level, limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages, logName, level };
}
