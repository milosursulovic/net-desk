import IpEntry from "../../models/IpEntry.js";

function ipToNumber(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
}

export default async function () {
  const entries = await IpEntry.find({ ipNumeric: { $exists: false } });

  for (const entry of entries) {
    if (entry.ip) {
      entry.ipNumeric = ipToNumber(entry.ip);
      await entry.save();
      console.log(`Updated ${entry.ip} → ${entry.ipNumeric}`);
    }
  }
}
