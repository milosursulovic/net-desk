import { insertEventLogsBulk, listEventLogs } from "../repositories/eventLogs.repo.js";
import { paginate } from "../utils/pagination.js";

export async function ingestEventLogs(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries.map((item) => {
    // new Date(...) on purpose, not a raw string - the agent sends ISO 8601 with
    // 7 fractional-second digits and a "Z" suffix (C#'s DateTime.ToString("o")), which
    // MySQL DATETIME rejects directly ("Incorrect datetime value" - the Z suffix
    // is never accepted, and neither are >6 decimals - see the same fix in
    // dnsLogs.service.js, discovered live on exactly that branch first). new Date()
    // parses the string correctly, mysql2 then serializes the Date object on its own.
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
