// Normalize IPv6-mapped IPv4 in IpEntry.ip (e.g., ::ffff:10.0.0.1 -> 10.0.0.1)
import IpEntry from "../../models/IpEntry.js";
import { ipToNumeric, isValidIPv4 } from "../../utils/ip.js";

const DRY_RUN = !!process.env.DRY_RUN;

function normalizeIPv4(ip = "") {
  return ip?.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export default async function migrate() {
  const bad = await IpEntry.find({ ip: /^::ffff:/ }, { _id: 1, ip: 1 }).lean();
  if (!bad.length) {
    console.log("01) No ::ffff: IpEntry rows found. Skipping.");
    return;
  }

  console.log(
    `01) Found ${bad.length} IpEntry rows with ::ffff:. ${
      DRY_RUN ? "(dry-run)" : ""
    }`
  );

  const ops = [];
  for (const b of bad) {
    const clean = normalizeIPv4(b.ip);
    if (!isValidIPv4(clean)) {
      console.warn(`01) Skipping invalid after normalize: ${b.ip} -> ${clean}`);
      continue;
    }
    ops.push({
      updateOne: {
        filter: { _id: b._id },
        update: { $set: { ip: clean, ipNumeric: ipToNumeric(clean) } },
      },
    });
  }

  if (!ops.length) {
    console.log("01) Nothing to update after validation.");
    return;
  }

  if (DRY_RUN) {
    console.log(`01) Would update ${ops.length} IpEntry docs (dry-run).`);
    return;
  }

  const res = await IpEntry.bulkWrite(ops, { ordered: false });
  console.log(
    `01) Updated IpEntry docs: matched=${res.matchedCount ?? 0}, modified=${
      res.modifiedCount ?? 0
    }`
  );
}
