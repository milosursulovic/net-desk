import IpEntry from "../../models/IpEntry.js";

export default async function () {
  const entries = await IpEntry.find({
    $or: [{ anyDesk: { $exists: false } }, { anyDesk: null }],
  });

  for (const entry of entries) {
    entry.anyDesk = "";
    await entry.save();
    console.log(`Set default anyDesk for ${entry.ip}`);
  }
}
