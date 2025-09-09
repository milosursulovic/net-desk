import IpEntry from "../../models/IpEntry.js";
import ComputerMetadata from "../../models/ComputerMetadata.js";

async function findOrphanComputerMetadata() {
  const ipIds = await IpEntry.distinct("_id");
  // CM koji referišu na IpEntry koji ne postoji
  return ComputerMetadata.find({ ipEntry: { $nin: ipIds } });
}

// ako želiš odmah da obrišeš:
async function deleteOrphanComputerMetadata() {
  const ipIds = await IpEntry.distinct("_id");
  const res = await ComputerMetadata.deleteMany({ ipEntry: { $nin: ipIds } });
  console.log("Obrisano CM siročića:", res.deletedCount);
}
