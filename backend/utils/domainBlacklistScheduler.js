import { syncDomainBlacklists } from "../services/domainBlacklistSync.service.js";

// Same self-correcting setTimeout-chain pattern as serverHealthScheduler.js
// - immediately on startup (a new server gets the full list right away, doesn't wait up to 24h),
// then again every intervalHours from then on, with no accumulated drift if one
// cycle takes longer (a slow source/network).
export function startDomainBlacklistSyncLoop(intervalHours = 24) {
  console.log(`🚫 Sinhronizacija crne liste domena na svakih ${intervalHours}h`);

  let stopped = false;
  let timer = null;

  const tick = async () => {
    const startedAt = Date.now();
    try {
      const results = await syncDomainBlacklists();
      const summary = results
        .map((r) =>
          r.error
            ? `${r.source}: GREŠKA (${r.error})`
            : `${r.source}: +${r.inserted} novih (od ${r.fetched})`,
        )
        .join("; ");
      console.log(`🚫 Sinhronizacija crne liste domena završena - ${summary}`);
    } catch (err) {
      console.error("❌ Greška pri sinhronizaciji crne liste domena:", err?.message || err);
    } finally {
      const took = Date.now() - startedAt;
      const delay = Math.max(0, intervalHours * 3600 * 1000 - took);
      if (!stopped) timer = setTimeout(tick, delay);
    }
  };

  tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log("🛑 Sinhronizacija crne liste domena zaustavljena");
    },
  };
}
