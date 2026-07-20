import {
  getInventoryCoverage,
  getSoftwareStats,
  getTopSoftware,
  getTopPublishers,
  getSoftwareMultipleVersions,
  getRareSoftware,
  getComputersWithMostSoftware,
  getDriverStats,
  getTopDriverManufacturers,
  getOldestDrivers,
  getDriverMultipleVersions,
  getComputersWithMostDrivers,
  getServiceStats,
  getAutomaticStoppedServices,
  getUnusualServicePaths,
  getRareServices,
  getUpdateStats,
  getUpdateFreshnessBuckets,
  getTopHotfixes,
  getLatestUpdateByComputer,
  getStaleUpdateComputers,
  getAllSoftwareForExport,
  getAllDriversForExport,
  getAllServicesForExport,
  getAllUpdatesForExport,
  searchSoftwareRows,
  searchDriverRows,
  searchServiceRows,
  searchUpdateRows,
} from "../repositories/pdsuAnalytics.repo.js";
import { badRequest } from "../utils/httpError.js";

const SEARCH_HANDLERS = {
  software: searchSoftwareRows,
  drivers: searchDriverRows,
  services: searchServiceRows,
  updates: searchUpdateRows,
};

function pct(value, total) {
  const safeValue = Number(value) || 0;
  const safeTotal = Number(total) || 0;

  if (!safeTotal) return 0;

  return Math.round((safeValue / safeTotal) * 100);
}

export async function inventoryAnalyticsStatsService() {
  const [
    coverage,

    softwareStats,
    topSoftware,
    topPublishers,
    softwareMultipleVersions,
    rareSoftware,
    computersWithMostSoftware,

    driverStats,
    topDriverManufacturers,
    oldestDrivers,
    driverMultipleVersions,
    computersWithMostDrivers,

    serviceStats,
    automaticStoppedServices,
    unusualServicePaths,
    rareServices,

    updateStats,
    updateFreshness,
    topHotfixes,
    latestUpdatesByComputer,
    staleUpdateComputers,
  ] = await Promise.all([
    getInventoryCoverage(),

    getSoftwareStats(),
    getTopSoftware(10),
    getTopPublishers(10),
    getSoftwareMultipleVersions(20),
    getRareSoftware(20),
    getComputersWithMostSoftware(10),

    getDriverStats(),
    getTopDriverManufacturers(10),
    getOldestDrivers(20),
    getDriverMultipleVersions(20),
    getComputersWithMostDrivers(10),

    getServiceStats(),
    getAutomaticStoppedServices(30),
    getUnusualServicePaths(30),
    getRareServices(20),

    getUpdateStats(),
    getUpdateFreshnessBuckets(),
    getTopHotfixes(10),
    getLatestUpdateByComputer(200),
    getStaleUpdateComputers(90, 50),
  ]);

  const totalComputers = Number(coverage.totalComputers) || 0;

  return {
    generatedAt: new Date().toISOString(),

    coverage: {
      ...coverage,

      softwarePct: pct(coverage.withSoftware, totalComputers),

      driversPct: pct(coverage.withDrivers, totalComputers),

      servicesPct: pct(coverage.withServices, totalComputers),

      updatesPct: pct(coverage.withUpdates, totalComputers),

      withoutSoftware: Math.max(
        totalComputers - Number(coverage.withSoftware || 0),
        0,
      ),

      withoutDrivers: Math.max(
        totalComputers - Number(coverage.withDrivers || 0),
        0,
      ),

      withoutServices: Math.max(
        totalComputers - Number(coverage.withServices || 0),
        0,
      ),

      withoutUpdates: Math.max(
        totalComputers - Number(coverage.withUpdates || 0),
        0,
      ),
    },

    software: {
      stats: softwareStats,

      tables: {
        topSoftware,
        topPublishers,
        multipleVersions: softwareMultipleVersions,
        rareSoftware,
        computersWithMostSoftware,
      },
    },

    drivers: {
      stats: driverStats,

      tables: {
        topManufacturers: topDriverManufacturers,
        oldestDrivers,
        multipleVersions: driverMultipleVersions,
        computersWithMostDrivers,
      },
    },

    services: {
      stats: serviceStats,

      tables: {
        automaticStopped: automaticStoppedServices,
        unusualPaths: unusualServicePaths,
        rareServices,
      },
    },

    updates: {
      stats: {
        ...updateStats,
        freshness: updateFreshness,
      },

      tables: {
        topHotfixes,
        latestByComputer: latestUpdatesByComputer,
        staleComputers: staleUpdateComputers,
      },
    },
  };
}

export async function searchPdsuAnalytics(category, term) {
  const query = String(term ?? "").trim();

  if (category === "all") {
    if (!query) {
      return { software: [], drivers: [], services: [], updates: [] };
    }

    const [software, drivers, services, updates] = await Promise.all([
      searchSoftwareRows(query, 50),
      searchDriverRows(query, 50),
      searchServiceRows(query, 50),
      searchUpdateRows(query, 50),
    ]);

    return { software, drivers, services, updates };
  }

  const handler = SEARCH_HANDLERS[category];
  if (!handler) {
    throw badRequest("Nepoznata kategorija za pretragu.");
  }

  if (!query) return [];

  return await handler(query, 100);
}

export async function exportPdsuAnalyticsXlsx() {
  const [software, drivers, services, updates] = await Promise.all([
    getAllSoftwareForExport(),
    getAllDriversForExport(),
    getAllServicesForExport(),
    getAllUpdatesForExport(),
  ]);

  return { software, drivers, services, updates };
}
