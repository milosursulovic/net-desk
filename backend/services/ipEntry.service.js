import IpEntry from "../models/IpEntry.js";
import ComputerMetadata from "../models/ComputerMetadata.js";

export async function setMetadataForIp(ip, metadataPayload) {
  let ipEntry = await IpEntry.findOne({ ip });
  if (!ipEntry) {
    ipEntry = await IpEntry.create({ ip });
  }

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

  if (!ipEntry.metadata || String(ipEntry.metadata) !== String(meta._id)) {
    ipEntry.metadata = meta._id;
    await ipEntry.save();
  }

  return { ipEntry: ipEntry.toObject(), metadata: meta.toObject() };
}
