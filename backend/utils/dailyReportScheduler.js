import { generateDailyReport } from "../services/dailyReport.service.js";

// Recomputed on every cycle (not a fixed 24h interval) so DST transitions
// don't drift the fire time away from actual local 7:00 over time.
function msUntilNextRun(hour) {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export function startDailyReportScheduler(hour = 7) {
  let stopped = false;
  let timer = null;

  const scheduleNext = () => {
    if (stopped) return;
    timer = setTimeout(tick, msUntilNextRun(hour));
  };

  const tick = async () => {
    try {
      await generateDailyReport();
      console.log("📋 Dnevni izveštaj generisan");
    } catch (err) {
      console.error("❌ Greška pri generisanju dnevnog izveštaja:", err);
    } finally {
      scheduleNext();
    }
  };

  scheduleNext();

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
