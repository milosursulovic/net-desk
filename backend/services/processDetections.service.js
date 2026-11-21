import { upsertProcessDetectionsBulk, listProcessDetections } from "../repositories/processDetections.repo.js";
import { paginate } from "../utils/pagination.js";

export async function ingestProcessDetections(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries
    .map((item) => {
      const processName = String(item.processName || "").trim().toLowerCase();
      if (!processName) return null;

      // new Date(...) on purpose, not a raw string - same reason as the DNS
      // logs (dnsLogs.service.js): the agent sends ISO 8601 with 7 fractional-second
      // digits and a "Z" suffix (C#'s DateTime.ToString("o")), which MySQL
      // DATETIME rejects directly.
      const firstSeen = item.firstSeen ? new Date(item.firstSeen) : new Date();
      const lastSeen = item.lastSeen ? new Date(item.lastSeen) : new Date();

      return {
        ip_entry_id: ipEntryId,
        process_name: processName,
        first_seen: isNaN(firstSeen) ? new Date() : firstSeen,
        last_seen: isNaN(lastSeen) ? new Date() : lastSeen,
        detection_count: Number(item.count) > 0 ? Number(item.count) : 1,
        // The agent sends killed=1 ONLY when AgentSettings.KillWatchedProcesses
        // is enabled and at least one instance of this process was successfully killed this
        // cycle - Number(item.killed) > 0 covers both a number and a truthy JSON bool.
        kill_count: Number(item.killed) > 0 ? 1 : 0,
      };
    })
    .filter(Boolean);

  await upsertProcessDetectionsBulk(rows);
  return true;
}

// sortBy is interpolated directly into ORDER BY in the repo (a column can't be
// a bound parameter) - this whitelist IS the SQL injection protection, same
// pattern as dnsLogs.service.js/inventory.dto.js's SORT_FIELDS.
const SORT_FIELDS = {
  processName: "cpd.process_name",
  firstSeen: "cpd.first_seen",
  lastSeen: "cpd.last_seen",
  detectionCount: "cpd.detection_count",
  killCount: "cpd.kill_count",
  computerName: "ie.computer_name",
};

export async function listProcessDetectionsService(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
  const search = String(query.search || "").trim();
  const site = query.site;

  const sortBy = SORT_FIELDS[query.sortBy] || SORT_FIELDS.lastSeen;
  const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";

  const { items, total } = await listProcessDetections({
    search,
    site,
    page,
    limit,
    sortBy,
    sortOrder,
  });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  return { items, page: safePage, limit, total, totalPages, search };
}
