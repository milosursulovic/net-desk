import { z } from "zod";

export const ActivityLogQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  username: z.string().trim().optional(),
  action: z.string().trim().optional(),
});
