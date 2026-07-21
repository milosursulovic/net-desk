import { z } from "zod";
import { emptyToNull } from "../utils/strings.js";

// This isn't just a camelCase->column display map - inventory.repo.js
// interpolates the resolved column name directly into the SQL string
// (can't parameterize an ORDER BY column), so this whitelist IS the SQL
// injection defense. Never let an unvalidated sortKey reach the query.
export const SORT_FIELDS = {
  type: "type",
  manufacturer: "manufacturer",
  model: "model",
  location: "location",
  createdAt: "created_at",
};

const ALLOWED_STATUS = new Set(["available", "in-use", "reserved", "faulty"]);
export function normalizeStatus(s) {
  const v = (s ?? "").toString().trim();
  return ALLOWED_STATUS.has(v) ? v : "available";
}

export const InventoryCreateSchema = z.object({
  type: z.string().min(1).transform(emptyToNull),
  manufacturer: z.any().optional().transform(emptyToNull),
  model: z.string().min(1).transform(emptyToNull),
  serialNumber: z.any().optional().transform(emptyToNull),
  quantity: z.coerce.number().int().min(1).optional().default(1),
  status: z.any().optional(),
  capacity: z.any().optional().transform(emptyToNull),
  speed: z.any().optional().transform(emptyToNull),
  socket: z.any().optional().transform(emptyToNull),
  location: z.any().optional().transform(emptyToNull),
  notes: z.any().optional().transform(emptyToNull),
});

export const InventoryUpdateSchema = InventoryCreateSchema.partial();
