import { listNotifications } from "../services/notifications.service.js";
import { sendPushToAll } from "./webPush.js";

// listNotifications() recomputes the FULL current alert set every call (see
// notifications.service.js) - it has no concept of "new" vs "already seen".
// A push should only fire once per alert *appearing*, not on every tick
// while it persists, so this keeps the previous tick's id set in memory and
// only pushes for ids that weren't there last time. Module-level state is
// fine here (mirrors pingService.js's own singleton-loop style) - a server
// restart just means any already-active alert can push once more, which is
// an acceptable tradeoff for not needing separate persistence.
export function startPushNotificationWatcher(intervalSeconds = 60) {
  let previousIds = new Set();
  let stopped = false;
  let timer = null;

  const tick = async () => {
    const startedAt = Date.now();

    try {
      const { notifications } = await listNotifications();
      const currentIds = new Set(notifications.map((n) => n.id));

      const newOnes = notifications.filter((n) => !previousIds.has(n.id));
      for (const n of newOnes) {
        await sendPushToAll({
          title: "Netdesk upozorenje",
          body: n.message,
          url: n.to || "/",
        });
      }

      previousIds = currentIds;
    } catch (err) {
      console.error("❌ Push notification watcher error:", err);
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
    },
  };
}
