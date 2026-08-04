import { z } from "zod";
import { emptyToNull } from "../utils/strings.js";

export const FlagSoftwareSchema = z.object({
  displayName: z.string().min(1),
  publisher: z.any().optional().transform(emptyToNull),
  reason: z.any().optional().transform(emptyToNull),
});

export const FlagServiceSchema = z.object({
  name: z.string().min(1),
  displayName: z.any().optional().transform(emptyToNull),
  reason: z.any().optional().transform(emptyToNull),
});

export const FlagDriverSchema = z.object({
  deviceName: z.string().min(1),
  driverProviderName: z.any().optional().transform(emptyToNull),
  reason: z.any().optional().transform(emptyToNull),
});
