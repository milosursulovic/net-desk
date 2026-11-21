import { listActivityLog, fetchActivityLogForExport } from "../repositories/activityLog.repo.js";
import { paginate } from "../utils/pagination.js";

export async function listActivityLogService({ page, limit, username, action, category, dateFrom, dateTo }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listActivityLog({ limit, offset, username, action, category, dateFrom, dateTo });
  const { page: safePage, totalPages } = paginate({ page, limit, total });
  return { items, page: safePage, limit, total, totalPages };
}

export async function exportActivityLogService(filters) {
  return await fetchActivityLogForExport(filters);
}
