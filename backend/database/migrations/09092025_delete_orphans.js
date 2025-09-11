import ComputerMetadata from "./models/ComputerMetadata.js";
import IpEntry from "./models/ipEntry.js";

export default async function () {
  try {
    const ipIds = await IpEntry.distinct("_id");

    const result = await ComputerMetadata.deleteMany({
      ipEntry: { $nin: ipIds },
    });

    console.log(`Obrisano siročića iz ComputerMetadata: ${result.deletedCount}`);
  } catch (err) {
    console.error("Greška pri brisanju siročića:", err);
  }
}