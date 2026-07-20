import { getByIdService } from "./ipAddresses.service.js";
import { getStatusHistory } from "../repositories/ipStatusHistory.repo.js";

function buildPeriods(entry, historyDesc) {
  const ascending = [...historyDesc].reverse();

  if (ascending.length === 0) {
    if (!entry.lastStatusChange) return [];

    return [
      {
        status: entry.isOnline ? "online" : "offline",
        from: entry.lastStatusChange,
        to: null,
      },
    ];
  }

  const periods = ascending.map((current, index) => {
    const next = ascending[index + 1];

    return {
      status: current.isOnline ? "online" : "offline",
      from: current.changedAt,
      to: next ? next.changedAt : null,
    };
  });

  return periods.reverse();
}

export async function getUptimeHistory(id) {
  const entry = await getByIdService(id);
  const history = await getStatusHistory(id);

  return {
    currentStatus: entry.isOnline ? "online" : "offline",
    lastChecked: entry.lastChecked,
    periods: buildPeriods(entry, history),
  };
}
