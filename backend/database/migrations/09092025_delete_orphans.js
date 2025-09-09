import mongoose from "mongoose";
import ComputerMetadata from "./models/ComputerMetadata.js";
import IpEntry from "./models/ipEntry.js";

async function deleteOrphanComputerMetadata() {
  try {
    // prvo pokupi sve validne IpEntry._id vrednosti
    const ipIds = await IpEntry.distinct("_id");

    // obriši sve ComputerMetadata čiji ipEntry nije u toj listi
    const result = await ComputerMetadata.deleteMany({
      ipEntry: { $nin: ipIds },
    });

    console.log(`Obrisano siročića iz ComputerMetadata: ${result.deletedCount}`);
  } catch (err) {
    console.error("Greška pri brisanju siročića:", err);
  }
}

// primer pokretanja
await deleteOrphanComputerMetadata();
