import { toInt, clamp } from "../utils/numbers.js";
import { normalizeStatus, SORT_FIELDS } from "../dtos/inventory.dto.js";
import {
    inventoryInsert,
    inventoryFindById,
    inventoryUpdate,
    inventoryDelete,
    inventoryListWithCounts,
} from "../repositories/inventory.repo.js";

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

    if (search !== "") {
        const like = `%${search}%`;
        where.push(`(
      manufacturer LIKE ? OR
      model LIKE ? OR
      serial_number LIKE ? OR
      location LIKE ? OR
      notes LIKE ? OR
      capacity LIKE ? OR
      speed LIKE ? OR
      socket LIKE ?
    )`);
        params.push(like, like, like, like, like, like, like, like);
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
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const page = totalPages === 0 ? 1 : clamp(rawPage, 1, totalPages);
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
        const err = new Error("Stavka nije pronađena.");
        err.status = 404;
        throw err;
    }
    return await inventoryFindById(id);
}

export async function deleteInventoryItem(id) {
    const affected = await inventoryDelete(id);
    if (!affected) {
        const err = new Error("Stavka nije pronađena.");
        err.status = 404;
        throw err;
    }
    return true;
}
