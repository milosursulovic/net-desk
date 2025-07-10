import IpEntry from "../../models/IpEntry.js";

export default async function () {
  const entries = await IpEntry.find({
    $or: [{ system: { $exists: false } }, { system: null }],
  });

  for (const entry of entries) {
    entry.system = "";
    await entry.save();
    console.log(`Set default system for ${entry.ip}`);
  }
}
