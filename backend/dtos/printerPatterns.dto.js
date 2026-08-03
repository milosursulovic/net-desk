import { z } from "zod";
import { emptyToNull } from "../utils/strings.js";

export const PrinterPatternSchema = z.object({
  pattern: z.string().min(1).max(150),
  reason: z.any().optional().transform(emptyToNull),
});
