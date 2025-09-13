// Bind Domain.ip -> Domain.ipEntry and unset legacy "ip"
import Domain from "../../models/Domain.js";
import IpEntry from "../../models/IpEntry.js";
import { ipToNumeric, isValidIPv4 } from "../../utils/ip.js";

const DRY_RUN = !!process.env.DRY_RUN;
const CREATE_MISSING = !!process.env.MIGRATE_CREATE_MISSING;
const BATCH = 1000;

function normalizeIPv4(ip = "") {
  return ip?.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export default async function migrate() {
  console.log(
    `02) Starting Domain.ip -> ipEntry migration ${DRY_RUN ? "(dry-run)" : ""}${
      CREATE_MISSING ? " [create-missing]" : ""
    }`
  );

  // Cursor over Domains that still have legacy ip or missing ipEntry
  const cursor = Domain.find(
    {
      $or: [
        { ip: { $type: "string", $exists: true } },
        { ipEntry: { $exists: false } },
        { ipEntry: null },
      ],
    },
    { _id: 1, ip: 1, ipEntry: 1 }
  )
    .lean()
    .cursor();

  let scanned = 0;
  let updated = 0;
  let missing = 0;
  let skippedNoIP = 0;
  const missingMap = new Map();
  const cache = new Map(); // ip -> ipEntryId
  let ops = [];

  for await (const d of cursor) {
    scanned++;
    const rawIp = d.ip || "";
    const ipv4 = normalizeIPv4(rawIp);

    if (!ipv4) {
      skippedNoIP++;
      continue;
    }
    if (!isValidIPv4(ipv4)) {
      missing++;
      missingMap.set(ipv4, (missingMap.get(ipv4) || 0) + 1);
      continue;
    }

    let ipEntryId = cache.get(ipv4);
    if (!ipEntryId) {
      const found = await IpEntry.findOne({ ip: ipv4 }, { _id: 1 }).lean();
      ipEntryId = found?._id;
      if (ipEntryId) cache.set(ipv4, ipEntryId);
    }

    if (!ipEntryId && CREATE_MISSING) {
      try {
        const doc = await IpEntry.create({
          ip: ipv4,
          ipNumeric: ipToNumeric(ipv4),
        });
        ipEntryId = doc._id;
        cache.set(ipv4, ipEntryId);
      } catch {
        // race/unique: re-read once
        const again = await IpEntry.findOne({ ip: ipv4 }, { _id: 1 }).lean();
        ipEntryId = again?._id;
        if (ipEntryId) cache.set(ipv4, ipEntryId);
      }
    }

    if (!ipEntryId) {
      missing++;
      missingMap.set(ipv4, (missingMap.get(ipv4) || 0) + 1);
      continue;
    }

    ops.push({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { ipEntry: ipEntryId }, $unset: { ip: "" } },
      },
    });

    if (ops.length >= BATCH) {
      if (!DRY_RUN) {
        const res = await Domain.bulkWrite(ops, { ordered: false });
        updated += res.modifiedCount ?? 0;
      }
      console.log(`02) Bulk processed ${ops.length} updates…`);
      ops = [];
    }
  }

  if (ops.length) {
    if (!DRY_RUN) {
      const res = await Domain.bulkWrite(ops, { ordered: false });
      updated += res.modifiedCount ?? 0;
    }
    console.log(`02) Bulk processed final ${ops.length} updates…`);
  }

  console.log("02) ————————————————————————————————");
  console.log(`02) Scanned:           ${scanned}`);
  console.log(
    `02) Updated:           ${updated}${DRY_RUN ? " (dry-run)" : ""}`
  );
  console.log(`02) Skipped (no ip):   ${skippedNoIP}`);
  console.log(`02) Missing IpEntry:   ${missing}`);
  if (missingMap.size) {
    console.log("02) Missing examples:");
    for (const [ip, count] of [...missingMap.entries()].slice(0, 20)) {
      console.log(`    - ${ip} (${count})`);
    }
    if (missingMap.size > 20) {
      console.log(`    …and ${missingMap.size - 20} more unique IPs.`);
    }
  }
  console.log("02) Done.");
}
