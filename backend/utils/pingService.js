import os from "os";
import ping from "ping";
import pLimit from "p-limit";
import { pool } from "../db/pool.js";
import { insertStatusHistoryBulk } from "../repositories/ipStatusHistory.repo.js";

export function startPingLoop(
  intervalSeconds = 30,
  concurrency = 20,
  pingTimeoutSeconds = 2,
) {
  console.log(
    `🔁 Ping service every ${intervalSeconds}s, concurrency=${concurrency}, timeout=${pingTimeoutSeconds}s`,
  );

  const platform = os.platform();

  const pingOpts =
    platform === "win32"
      ? { timeout: pingTimeoutSeconds, min_reply: 1 }
      : {
          timeout: pingTimeoutSeconds,
          min_reply: 1,
          deadline: pingTimeoutSeconds + 1,
        };

  const limit = pLimit(concurrency);
  let stopped = false;
  let timer = null;
  let errorLogBudget = 10;

  const tick = async () => {
    const startedAt = Date.now();
    const now = new Date();

    try {
      const [entries] = await pool.execute(
        `
        SELECT
          id,
          ip,
          computer_name AS computerName,
          is_online AS isOnline
        FROM ip_entries
        `,
      );

      const results = await Promise.all(
        entries.map((e) =>
          limit(async () => {
            try {
              const r = await ping.promise.probe(e.ip, pingOpts);
              return {
                id: e.id,
                ip: e.ip,
                name: e.computerName || e.ip,
                prev: !!e.isOnline,
                alive: !!r.alive,
              };
            } catch (err) {
              if (errorLogBudget-- > 0) {
                console.error(
                  `❌ ping error for ${e.ip}:`,
                  err?.message || err,
                );
                if (errorLogBudget === 0) {
                  console.error(
                    "🔕 Further ping errors will be suppressed this run.",
                  );
                }
              }
              return {
                id: e.id,
                ip: e.ip,
                name: e.computerName || e.ip,
                prev: !!e.isOnline,
                alive: false,
              };
            }
          }),
        ),
      );

      const changed = [];
      const unchanged = [];

      for (const r of results) {
        const isChanged = r.prev !== r.alive;
        if (isChanged) {
          console.log(
            `📡 ${r.name} (${r.ip}) → ${r.alive ? "Online" : "Offline"} (changed)`,
          );
          changed.push(r);
        } else {
          unchanged.push(r);
        }
      }

      const idsAll = results.map((r) => r.id);
      if (idsAll.length) {
        const caseOnline = idsAll.map(() => "WHEN ? THEN ?").join(" ");
        const sqlAll = `
          UPDATE ip_entries
          SET
            is_online = CASE id ${caseOnline} ELSE is_online END,
            last_checked = ?
          WHERE id IN (${idsAll.map(() => "?").join(",")})
        `;

        const paramsAll = [];
        for (const r of results) {
          paramsAll.push(r.id, r.alive ? 1 : 0);
        }
        paramsAll.push(now);
        paramsAll.push(...idsAll);

        await pool.execute(sqlAll, paramsAll);
      }

      if (changed.length) {
        const idsChanged = changed.map((r) => r.id);
        await pool.execute(
          `
          UPDATE ip_entries
          SET last_status_change = ?
          WHERE id IN (${idsChanged.map(() => "?").join(",")})
          `,
          [now, ...idsChanged],
        );

        await insertStatusHistoryBulk(
          changed.map((r) => ({
            ip_entry_id: r.id,
            is_online: r.alive,
            changed_at: now,
          })),
        );
      }
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
