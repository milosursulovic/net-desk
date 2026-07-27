import { captureServerSnapshot } from "../services/serverHealth.service.js";

// Same self-correcting setTimeout-chain pattern as pingService.js - a slow
// snapshot (DB hiccup) doesn't compound into ever-increasing drift the way
// a naive setInterval would.
export function startServerHealthSnapshotLoop(intervalSeconds = 120) {
  console.log(`📈 Server health snapshot every ${intervalSeconds}s`);

  let stopped = false;
  let timer = null;

  const tick = async () => {
    const startedAt = Date.now();
    try {
      await captureServerSnapshot();
    } catch (err) {
      console.error("❌ Server health snapshot error:", err?.message || err);
    } finally {
      const took = Date.now() - startedAt;
      const delay = Math.max(0, intervalSeconds * 1000 - took);
      if (!stopped) timer = setTimeout(tick, delay);
    }
  };

  tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      console.log("🛑 Server health snapshot loop stopped");
    },
  };
}
