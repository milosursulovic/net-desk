import {
  countOfflineEntries,
  countDuplicateNameGroups,
  countUnclassifiedEntries,
  countAutomaticStoppedServices,
  countStaleUpdateComputers,
  countDiskFullAgents,
  countAntivirusInactiveAgents,
  countFirewallInactiveAgents,
  countFailedJobsRecent,
  countWuServiceUnavailable,
} from "../repositories/notifications.repo.js";

export async function listNotifications() {
  const [
    offline,
    duplicates,
    unclassified,
    autoStopped,
    staleUpdates,
    diskFull,
    avInactive,
    fwInactive,
    failedJobs,
    wuUnavailable,
  ] = await Promise.all([
    countOfflineEntries(),
    countDuplicateNameGroups(),
    countUnclassifiedEntries(),
    countAutomaticStoppedServices(),
    countStaleUpdateComputers(90),
    countDiskFullAgents(90),
    countAntivirusInactiveAgents(),
    countFirewallInactiveAgents(),
    countFailedJobsRecent(24),
    countWuServiceUnavailable(),
  ]);

  const notifications = [];

  if (diskFull > 0) {
    notifications.push({
      id: "disk-full",
      level: "critical",
      message: `${diskFull} računara ima disk preko 90% popunjenosti`,
      to: "/agents",
    });
  }

  if (avInactive > 0) {
    notifications.push({
      id: "antivirus-inactive",
      level: "critical",
      message: `${avInactive} računara nema aktivan antivirus`,
      to: "/agents",
    });
  }

  if (fwInactive > 0) {
    notifications.push({
      id: "firewall-inactive",
      level: "critical",
      message: `${fwInactive} računara nema aktivan firewall`,
      to: "/agents",
    });
  }

  if (failedJobs > 0) {
    notifications.push({
      id: "failed-jobs",
      level: "warning",
      message: `${failedJobs} neuspešno izvršenih komandi u poslednja 24h`,
      to: "/agents",
    });
  }

  if (wuUnavailable > 0) {
    notifications.push({
      id: "wu-unavailable",
      level: "warning",
      message: `${wuUnavailable} računara ima nedostupan Windows Update servis`,
      to: "/agents",
    });
  }

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
