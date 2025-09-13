// services/pingService.js
import ping from "ping";
import pLimit from "p-limit";
import IpEntry from "../models/IpEntry.js";

/**
 * Pings all IpEntries and updates:
 *  - isOnline
 *  - lastChecked
 *  - lastStatusChange (only when the state flips)
 *
 * Returns a controller with stop() to terminate the loop.
 */
export function startPingLoop(
  intervalSeconds = 30,
  concurrency = 50,
  pingTimeoutSeconds = 1
) {
  console.log(
    `🔁 Ping service (IpEntry-only) every ${intervalSeconds}s, concurrency=${concurrency}, timeout=${pingTimeoutSeconds}s`
  );

  const limit = pLimit(concurrency);
  let stopped = false;
  let timer = null;

  const tick = async () => {
    const startedAt = Date.now();
    const now = new Date();

    try {
      // Pull only what we need
      const entries = await IpEntry.find(
        {},
        { _id: 1, ip: 1, computerName: 1, isOnline: 1 }
      ).lean();

      const results = await Promise.all(
        entries.map((e) =>
          limit(async () => {
            try {
              const r = await ping.promise.probe(e.ip, {
                timeout: pingTimeoutSeconds,
              });
              return {
                _id: e._id,
                ip: e.ip,
                name: e.computerName || e.ip,
                prev: e.isOnline,
                alive: !!r.alive,
              };
            } catch {
              return {
                _id: e._id,
                ip: e.ip,
                name: e.computerName || e.ip,
                prev: e.isOnline,
                alive: false,
              };
            }
          })
        )
      );

      const ops = [];
      for (const r of results) {
        const changed = r.prev !== r.alive;
        if (changed) {
          console.log(
            `📡 ${r.name} (${r.ip}) → ${
              r.alive ? "Online" : "Offline"
            } (changed)`
          );
        }
        ops.push({
          updateOne: {
            filter: { _id: r._id },
            update: {
              $set: {
                isOnline: r.alive,
                lastChecked: now,
                ...(changed ? { lastStatusChange: now } : {}),
              },
            },
          },
        });
      }

      if (ops.length) {
        await IpEntry.bulkWrite(ops, { ordered: false });
      }
    } catch (err) {
      console.error("❌ Ping tick error:", err);
    } finally {
      const took = Date.now() - startedAt;
      const delay = Math.max(0, intervalSeconds * 1000 - took);
      if (!stopped) timer = setTimeout(tick, delay);
    }
  };

  // start immediately
  tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log("🛑 Ping service stopped");
    },
  };
}
