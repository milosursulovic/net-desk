import {
  countOfflineEntries,
  countDuplicateNameGroups,
  countUnclassifiedEntries,
  countAutomaticStoppedServices,
  countStaleUpdateComputers,
} from "../repositories/notifications.repo.js";

export async function listNotifications() {
  const [offline, duplicates, unclassified, autoStopped, staleUpdates] =
    await Promise.all([
      countOfflineEntries(),
      countDuplicateNameGroups(),
      countUnclassifiedEntries(),
      countAutomaticStoppedServices(),
      countStaleUpdateComputers(90),
    ]);

  const notifications = [];

  if (autoStopped > 0) {
    notifications.push({
      id: "auto-stopped",
      level: "critical",
      message: `${autoStopped} automatskih servisa nije pokrenuto`,
      to: "/pdsu",
    });
  }

  if (offline > 0) {
    notifications.push({
      id: "offline",
      level: "warning",
      message: `${offline} unosa je trenutno offline`,
      to: "/",
    });
  }

  if (staleUpdates > 0) {
    notifications.push({
      id: "stale-updates",
      level: "warning",
      message: `${staleUpdates} računara bez Windows update-a duže od 90 dana`,
      to: "/pdsu",
    });
  }

  if (duplicates > 0) {
    notifications.push({
      id: "duplicates",
      level: "warning",
      message: `${duplicates} dupliranih imena računara`,
      to: "/",
    });
  }

  if (unclassified > 0) {
    notifications.push({
      id: "unclassified",
      level: "info",
      message: `${unclassified} unosa nema određen tip (Računar/Aparat)`,
      to: "/",
    });
  }

  return { notifications, generatedAt: new Date().toISOString() };
}
