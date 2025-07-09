import IpEntry from "../../models/IpEntry.js";

export default async function () {
  const entries = await IpEntry.find({
    $or: [{ dnsLog: { $exists: false } }, { dnsLog: null }],
  });

  for (const entry of entries) {
    entry.dnsLog = "";
    await entry.save();
    console.log(`Set default dnsLog for ${entry.ip}`);
  }
}
