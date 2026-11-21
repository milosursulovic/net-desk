import { z } from "zod";

// The agent reports the outcome of the consent dialog from the workstation.
// 'granted' = the user approved; any other value means the bridge must not start.
// approverUsername is required only for 'granted' (who approved); for other
// outcomes it may be null (e.g. nobody clicked, no user signed in).
export const VncConsentSchema = z
  .object({
    consentStatus: z.enum(["granted", "denied", "timeout", "unavailable"]),
    approverUsername: z.string().trim().max(255).nullable().optional(),
    agentIp: z.string().trim().max(45).nullable().optional(),
    agentMac: z.string().trim().max(255).nullable().optional(),
  })
  .refine(
    (d) => d.consentStatus !== "granted" || !!(d.approverUsername && d.approverUsername.length),
    { message: "approverUsername je obavezan kada je pristanak odobren", path: ["approverUsername"] },
  );
