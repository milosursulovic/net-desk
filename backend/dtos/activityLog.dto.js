import { z } from "zod";

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum mora biti u formatu YYYY-MM-DD")
  .optional();

// Deljeno izmedju liste i export-a. category grupise `action` u smislene grupe
// (vidi activityLog.repo.js). dateFrom/dateTo filtriraju po created_at (ceo dan,
// inkluzivno). .catch("all") - nepoznata kategorija pada na "all" umesto greske.
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
