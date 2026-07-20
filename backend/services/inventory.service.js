import { toInt, clamp } from "../utils/numbers.js";
import { normalizeStatus, SORT_FIELDS } from "../dtos/inventory.dto.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";
import { paginate } from "../utils/pagination.js";
import { notFound } from "../utils/httpError.js";
import {
  inventoryInsert,
  inventoryFindById,
  inventoryUpdate,
  inventoryDelete,
  inventoryListWithCounts,
} from "../repositories/inventory.repo.js";

const SEARCH_COLUMNS = [
  "manufacturer",
  "model",
  "serial_number",
  "location",
  "notes",
  "capacity",
  "speed",
  "socket",
];

export async function listInventory(query) {
  const rawPage = clamp(toInt(query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(query.limit, 12), 1, 100);

  const search = (query.search ?? "").toString().trim();
  const type = (query.type ?? "all").toString().trim();

  const sortBy = (query.sortBy ?? "createdAt").toString();
  const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";
  const sortKey = SORT_FIELDS[sortBy] || "created_at";

  const where = [];
  const params = [];

  if (type && type !== "all") {
    where.push("type = ?");
    params.push(type);
  }

  const searchClause = buildLikeSearch(SEARCH_COLUMNS, search);
  if (searchClause.where) {
    where.push(searchClause.where);
    params.push(...searchClause.params);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { countRows, countsRows } = await inventoryListWithCounts({
    whereSql,
    params,
    sortKey,
    sortOrder,
    limit: 1,
    offset: 0,
  });

  const total = Number(countRows?.[0]?.total ?? 0);
  const { page, totalPages } = paginate({ page: rawPage, limit, total });
  const offset = (page - 1) * limit;

  const { entries } = await inventoryListWithCounts({
    whereSql,
    params,
    sortKey,
    sortOrder,
    limit,
    offset,
  });

  const counts = { available: 0, inUse: 0, reserved: 0, faulty: 0 };
  for (const c of countsRows || []) {
    const qty = Number(c.totalQty) || 0;
    if (c.status === "available") counts.available = qty;
    if (c.status === "in-use") counts.inUse = qty;
    if (c.status === "reserved") counts.reserved = qty;
    if (c.status === "faulty") counts.faulty = qty;
  }

  return {
    entries,
    total,
    totalPages,
    page,
    limit,
    search,
    type,
    sortBy,
    sortOrder: sortOrder.toLowerCase(),
    counts,
  };
}

export async function createInventoryItem(dto) {
  const payload = { ...dto, status: normalizeStatus(dto.status) };
  const id = await inventoryInsert(payload);
  return await inventoryFindById(id);
}

export async function updateInventoryItem(id, dto) {
  const payload = { ...dto, status: normalizeStatus(dto.status) };
  const affected = await inventoryUpdate(id, payload);
  if (!affected) {
    throw notFound("Stavka nije pronađena.");
  }
  return await inventoryFindById(id);
}

export async function deleteInventoryItem(id) {
  const affected = await inventoryDelete(id);
  if (!affected) {
    throw notFound("Stavka nije pronađena.");
  }
  return true;
}
