import { findIpEntryIdByIp } from "../repositories/ipEntries.repo.js";
import { findOrCreate } from "../repositories/software.repo.js";
import { upsert } from "../repositories/computerSoftware.repo.js";

export async function sync(payload) {
  const { computer, software } = payload;

  if (!computer || !Array.isArray(software)) {
    throw new Error("Invalid payload");
  }

  const ipEntryId = await findIpEntryIdByIp(computer);
  if (!ipEntryId) {
    throw new Error("Unknown computer");
  }

  let processed = 0;

  for (const s of software) {
    const softwareId = await findOrCreate(s);

    await upsert({
      ipEntryId,
      softwareId,
      version: s.DisplayVersion,
      installDate: s.InstallDate,
    });

    processed++;
  }

  return {
    ok: true,
    computer,
    received: software.length,
    processed,
  };
}
