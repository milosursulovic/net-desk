import { z } from "zod";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum mora biti u formatu YYYY-MM-DD")
  .optional();

// Shared between the list and the export. category groups `action` into meaningful
// buckets (see activityLog.repo.js). dateFrom/dateTo filter on created_at (whole day,
// inclusive). .catch("all") - an unknown category falls back to "all" instead of an error.
const baseFilters = {
  username: z.string().trim().optional(),
  action: z.string().trim().optional(),
  category: z.enum(["all", "vnc", "auth", "requests", "other"]).catch("all").default("all"),
  dateFrom: dateOnly,
  dateTo: dateOnly,
};

export const ActivityLogQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  ...baseFilters,
});

export const ActivityLogExportSchema = z.object(baseFilters);
