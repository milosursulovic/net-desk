// services/ipEntry.service.js
import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";

/**
 * Upsert metapodataka za dati IP (1-1).
 * - Kreira IpEntry ako ne postoji (sa ip i ipNumeric).
 * - Upsert/replace ComputerMetadata vezan unique po ipEntry.
 * - Linkuje IpEntry.metadata ako nije već linkovan.
 */
export async function setMetadataForIp(ip, metadataPayload) {
  // 1) Nađi ili napravi IpEntry
  let ipEntry = await IpEntry.findOne({ ip });
  if (!ipEntry) {
    ipEntry = await IpEntry.create({ ip });
  }

  // 2) Upsert ComputerMetadata po ipEntry (1-1 unique)
  const meta = await ComputerMetadata.findOneAndUpdate(
    { ipEntry: ipEntry._id },
    {
      $set: {
        ...metadataPayload,
        ipEntry: ipEntry._id,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true,
      returnDocument: "after",
    }
  );

  // 3) Uveri se da IpEntry.metadata pokazuje na meta._id (nije obavezno, ali je zgodno)
  if (!ipEntry.metadata || String(ipEntry.metadata) !== String(meta._id)) {
    ipEntry.metadata = meta._id;
    await ipEntry.save(); // timestamps -> updatedAt će skočiti
  }

  // možeš vratiti oba radi praktičnosti
  return { ipEntry: ipEntry.toObject(), metadata: meta.toObject() };
}
