import { clamp } from "./numbers.js";

/**
 * Zajednička paginacija: clamp-uje traženu stranu na opseg [1, totalPages],
 * i vraća totalPages === 0 kad nema rezultata (umesto NaN/negativnih vrednosti).
 */
export function paginate({ page, limit, total }) {
  const safeTotal = Number(total) || 0;
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / limit);
  const safePage = totalPages === 0 ? 1 : clamp(page, 1, totalPages);

  return { page: safePage, limit, total: safeTotal, totalPages };
}
