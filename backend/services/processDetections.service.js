import { upsertProcessDetectionsBulk, listProcessDetections } from "../repositories/processDetections.repo.js";
import { paginate } from "../utils/pagination.js";

export async function ingestProcessDetections(ipEntryId, entries) {
  if (!entries.length) return true;

  const rows = entries
    .map((item) => {
      const processName = String(item.processName || "").trim().toLowerCase();
      if (!processName) return null;

      // new Date(...) je namerno, ne sirov string - isti razlog kao DNS
      // logovi (dnsLogs.service.js): agent šalje ISO 8601 sa 7 decimala
      // sekunde i "Z" sufiksom (C#-ov DateTime.ToString("o")), što MySQL
      // DATETIME odbija direktno.
      const firstSeen = item.firstSeen ? new Date(item.firstSeen) : new Date();
      const lastSeen = item.lastSeen ? new Date(item.lastSeen) : new Date();

      return {
        ip_entry_id: ipEntryId,
        process_name: processName,
        first_seen: isNaN(firstSeen) ? new Date() : firstSeen,
        last_seen: isNaN(lastSeen) ? new Date() : lastSeen,
        detection_count: Number(item.count) > 0 ? Number(item.count) : 1,
        // Agent šalje killed=1 SAMO kad je AgentSettings.KillWatchedProcesses
        // uključen i bar jedna instanca ovog procesa uspešno ubijena ovog
        // ciklusa - Number(item.killed) > 0 pokriva i broj i truthy JSON bool.
        kill_count: Number(item.killed) > 0 ? 1 : 0,
      };
    })
    .filter(Boolean);

  await upsertProcessDetectionsBulk(rows);
  return true;
}

// sortBy interpoluje se direktno u ORDER BY u repo-u (kolona ne može biti
// bound parametar) - ova whitelist JESTE SQL injection zaštita, isti
// obrazac kao dnsLogs.service.js/inventory.dto.js's SORT_FIELDS.
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
