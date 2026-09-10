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
  countBlacklistedDomainHits,
  countAgentOfflineButIpOnline,
} from "../repositories/notifications.repo.js";

export async function listNotifications(site) {
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
    blacklistedDomainHits,
    agentOfflineIpOnline,
  ] = await Promise.all([
    countOfflineEntries(site),
    countDuplicateNameGroups(site),
    countUnclassifiedEntries(site),
    countAutomaticStoppedServices(site),
    countStaleUpdateComputers(90, site),
    countDiskFullAgents(90, site),
    countAntivirusInactiveAgents(site),
    countFirewallInactiveAgents(site),
    countFailedJobsRecent(24, site),
    countWuServiceUnavailable(site),
    countBlacklistedDomainHits(24, site),
    countAgentOfflineButIpOnline(site),
  ]);

  const notifications = [];

  // `count` je dodat uz `message` da frontend UI ticker (NotificationTicker.vue)
  // može da prevede po `id`-u za trenutno izabrani jezik aplikacije - `message`
  // ostaje na srpskom kao fallback/za druge potrošače (dailyReport.service.js
  // PDF, pushNotificationWatcher.js push tekst) koji nisu per-viewer jezički
  // svesni.
  if (diskFull > 0) {
    notifications.push({
      id: "disk-full",
      level: "critical",
      message: `${diskFull} računara ima disk preko 90% popunjenosti`,
      count: diskFull,
      to: "/agents",
    });
  }

  if (avInactive > 0) {
    notifications.push({
      id: "antivirus-inactive",
      level: "critical",
      message: `${avInactive} računara nema aktivan antivirus`,
      count: avInactive,
      to: "/agents",
    });
  }

  if (fwInactive > 0) {
    notifications.push({
      id: "firewall-inactive",
      level: "critical",
      message: `${fwInactive} računara nema aktivan firewall`,
      count: fwInactive,
      to: "/agents",
    });
  }

  if (blacklistedDomainHits > 0) {
    notifications.push({
      id: "blacklisted-domain",
      level: "critical",
      message: `${blacklistedDomainHits} računara je poslednjih 24h posetilo domen sa crne liste`,
      count: blacklistedDomainHits,
      to: "/dns-logs",
    });
  }

  if (agentOfflineIpOnline > 0) {
    notifications.push({
      id: "agent-offline-ip-online",
      level: "warning",
      message: `${agentOfflineIpOnline} agenata je offline dok je računar dostupan na mreži - moguć kvar agenta`,
      count: agentOfflineIpOnline,
      to: "/agents?agentOfflineIpOnline=true",
    });
  }

  if (failedJobs > 0) {
    notifications.push({
      id: "failed-jobs",
      level: "warning",
      message: `${failedJobs} neuspešno izvršenih komandi u poslednja 24h`,
      count: failedJobs,
      to: "/agents",
    });
  }

  if (wuUnavailable > 0) {
    notifications.push({
      id: "wu-unavailable",
      level: "warning",
      message: `${wuUnavailable} računara ima nedostupan Windows Update servis`,
      count: wuUnavailable,
      to: "/agents",
    });
  }

  if (autoStopped > 0) {
    notifications.push({
      id: "auto-stopped",
      level: "critical",
      message: `${autoStopped} automatskih servisa nije pokrenuto`,
      count: autoStopped,
      to: "/pdsu",
    });
  }

  if (offline > 0) {
    notifications.push({
      id: "offline",
      level: "warning",
      message: `${offline} unosa je trenutno offline`,
      count: offline,
      to: "/",
    });
  }

  if (staleUpdates > 0) {
    notifications.push({
      id: "stale-updates",
      level: "warning",
      message: `${staleUpdates} računara bez Windows update-a duže od 90 dana`,
      count: staleUpdates,
      to: "/pdsu",
    });
  }

  if (duplicates > 0) {
    notifications.push({
      id: "duplicates",
      level: "warning",
      message: `${duplicates} dupliranih imena računara`,
      count: duplicates,
      to: "/",
    });
  }

  if (unclassified > 0) {
    notifications.push({
      id: "unclassified",
      level: "info",
      message: `${unclassified} unosa nema određen tip (Računar/Aparat)`,
      count: unclassified,
      to: "/",
    });
  }

  return { notifications, generatedAt: new Date().toISOString() };
}
