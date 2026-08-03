import { z } from "zod";
import { emptyToNull } from "../utils/strings.js";

export const FlagDomainSchema = z.object({
  domain: z.string().min(1),
  reason: z.any().optional().transform(emptyToNull),
});
