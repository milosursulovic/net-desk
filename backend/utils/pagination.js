import { clamp } from "./numbers.js";

/**
 * Shared pagination: clamps the requested page to the range [1, totalPages],
 * and returns totalPages === 0 when there are no results (instead of NaN/negative values).
 */
export function paginate({ page, limit, total }) {
  const safeTotal = Number(total) || 0;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit);
  const safePage = totalPages === 0 ? 1 : clamp(page, 1, totalPages);

  return { page: safePage, limit, total: safeTotal, totalPages };
}
