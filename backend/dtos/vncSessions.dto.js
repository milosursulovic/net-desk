import { z } from "zod";

// Agent prijavljuje ishod prozora za pristanak sa radne stanice. 'granted' =
// korisnik odobrio; ostale vrednosti znace da most ne sme da se digne.
// approverUsername je obavezno samo za 'granted' (ko je odobrio); kod ostalih
// ishoda moze biti null (npr. niko nije kliknuo, nema prijavljenog korisnika).
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
