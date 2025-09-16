// services/pingService.js
import os from "os";
import ping from "ping";
import pLimit from "p-limit";
import IpEntry from "../models/IpEntry.js";

export function startPingLoop(
  intervalSeconds = 30,
  concurrency = 20, // malo niže je stabilnije
  pingTimeoutSeconds = 2 // 2s je razumno za LAN
) {
  console.log(
    `🔁 Ping service every ${intervalSeconds}s, concurrency=${concurrency}, timeout=${pingTimeoutSeconds}s`
  );

  const platform = os.platform();

  // ⬇️ KLJUČNO: bez 'deadline' na Windows-u
  const pingOpts =
    platform === "win32"
      ? {
          timeout: pingTimeoutSeconds, // sekunde (node-ping prevodi u -w ms)
          min_reply: 1,
          // extra: ["-4"] // opcionalno forsiraj IPv4
        }
      : {
          timeout: pingTimeoutSeconds,
          min_reply: 1,
          deadline: pingTimeoutSeconds + 1, // ok za Linux/macOS
        };

  const limit = pLimit(concurrency);
  let stopped = false;
  let timer = null;
  let errorLogBudget = 10;

  const tick = async () => {
    const startedAt = Date.now();
    const now = new Date();
    try {
      const entries = await IpEntry.find(
        {},
        { _id: 1, ip: 1, computerName: 1, isOnline: 1 }
      ).lean();

      const results = await Promise.all(
        entries.map((e) =>
          limit(async () => {
            try {
              const r = await ping.promise.probe(e.ip, pingOpts);
              return {
                _id: e._id,
                ip: e.ip,
                name: e.computerName || e.ip,
                prev: e.isOnline,
                alive: !!r.alive,
              };
            } catch (err) {
              if (errorLogBudget-- > 0) {
                console.error(
                  `❌ ping error for ${e.ip}:`,
                  err?.message || err
                );
                if (errorLogBudget === 0) {
                  console.error(
                    "🔕 Further ping errors will be suppressed this run."
                  );
                }
              }
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
      if (ops.length) await IpEntry.bulkWrite(ops, { ordered: false });
    } catch (err) {
      console.error("❌ Ping tick error:", err);
    } finally {
      const took = Date.now() - startedAt;
      const delay = Math.max(0, intervalSeconds * 1000 - took);
      if (!stopped) timer = setTimeout(tick, delay);
      errorLogBudget = 10;
    }
  };

  tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log("🛑 Ping service stopped");
    },
  };
}
