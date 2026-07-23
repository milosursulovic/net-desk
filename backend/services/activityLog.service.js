import { listActivityLog } from "../repositories/activityLog.repo.js";
import { paginate } from "../utils/pagination.js";

export async function listActivityLogService({ page, limit, username, action }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listActivityLog({ limit, offset, username, action });
  const { page: safePage, totalPages } = paginate({ page, limit, total });
  return { items, page: safePage, limit, total, totalPages };
}
