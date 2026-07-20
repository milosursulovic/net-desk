import { insertEventLogsBulk, listEventLogs } from "../repositories/eventLogs.repo.js";
import { paginate } from "../utils/pagination.js";

export async function ingestEventLogs(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries.map((item) => ({
    ip_entry_id: ipEntryId,
    log_name: item.logName ?? "Application",
    level: item.level ?? null,
    source: item.source ?? null,
    event_id: item.eventId ?? null,
    message: item.message ?? null,
    logged_at: item.loggedAt ?? new Date(),
  }));

  await insertEventLogsBulk(rows);
  return true;
}

export async function listEventLogsService(ipEntryId, { page, limit, logName, level }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listEventLogs({ ipEntryId, logName, level, limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages, logName, level };
}
