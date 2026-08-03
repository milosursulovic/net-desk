import {
  listComputersWithoutPdsu,
  listComputersWithoutUltravnc,
  getPdsuCoverage,
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
  getPrinterStats,
  getTopPrinterNames,
  getTopPrinterDrivers,
  getPrintersWithProblemStatus,
  getRarePrinters,
  getComputersWithMostPrinters,
  getAllSoftwareForExport,
  getAllDriversForExport,
  getAllServicesForExport,
  getAllUpdatesForExport,
  getAllPrintersForExport,
  searchSoftwareRows,
  searchDriverRows,
  searchServiceRows,
  searchUpdateRows,
  searchPrinterRows,
} from "../repositories/pdsuAnalytics.repo.js";
import { badRequest } from "../utils/httpError.js";

const SEARCH_HANDLERS = {
  software: searchSoftwareRows,
  drivers: searchDriverRows,
  services: searchServiceRows,
  updates: searchUpdateRows,
  printers: searchPrinterRows,
};

function pct(value, total) {
  const safeValue = Number(value) || 0;
  const safeTotal = Number(total) || 0;

  if (!safeTotal) return 0;

  return Math.round((safeValue / safeTotal) * 100);
}

export async function pdsuAnalyticsStatsService(site) {
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

    printerStats,
    topPrinterNames,
    topPrinterDrivers,
    printersWithProblemStatus,
    rarePrinters,
    computersWithMostPrinters,
  ] = await Promise.all([
    getPdsuCoverage(site),

    getSoftwareStats(site),
    getTopSoftware(10, site),
    getTopPublishers(10, site),
    getSoftwareMultipleVersions(20, site),
    getRareSoftware(20, site),
    getComputersWithMostSoftware(10, site),

    getDriverStats(site),
    getTopDriverManufacturers(10, site),
    getOldestDrivers(20, site),
    getDriverMultipleVersions(20, site),
    getComputersWithMostDrivers(10, site),

    getServiceStats(site),
    getAutomaticStoppedServices(30, site),
    getUnusualServicePaths(30, site),
    getRareServices(20, site),

    getUpdateStats(site),
    getUpdateFreshnessBuckets(site),
    getTopHotfixes(10, site),
    getLatestUpdateByComputer(200, site),
    getStaleUpdateComputers(90, 50, site),

    getPrinterStats(site),
    getTopPrinterNames(10, site),
    getTopPrinterDrivers(10, site),
    getPrintersWithProblemStatus(30, site),
    getRarePrinters(20, site),
    getComputersWithMostPrinters(10, site),
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

      printersPct: pct(coverage.withPrinters, totalComputers),

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

      withoutPrinters: Math.max(
        totalComputers - Number(coverage.withPrinters || 0),
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

    printers: {
      stats: printerStats,

      tables: {
        topNames: topPrinterNames,
        topDrivers: topPrinterDrivers,
        problemStatus: printersWithProblemStatus,
        rarePrinters,
        computersWithMostPrinters,
      },
    },
  };
}

export async function listComputersWithoutPdsuService(site) {
  const items = await listComputersWithoutPdsu(site);
  return { items, total: items.length };
}

export async function listComputersWithoutUltravncService(site) {
  const items = await listComputersWithoutUltravnc(site);
  return { items, total: items.length };
}

export async function searchPdsuAnalytics(category, term, site) {
  const query = String(term ?? "").trim();

  if (category === "all") {
    if (!query) {
      return { software: [], drivers: [], services: [], updates: [], printers: [] };
    }

    const [software, drivers, services, updates, printers] = await Promise.all([
      searchSoftwareRows(query, 50, site),
      searchDriverRows(query, 50, site),
      searchServiceRows(query, 50, site),
      searchUpdateRows(query, 50, site),
      searchPrinterRows(query, 50, site),
    ]);

    return { software, drivers, services, updates, printers };
  }

  const handler = SEARCH_HANDLERS[category];
  if (!handler) {
    throw badRequest("Nepoznata kategorija za pretragu.");
  }

  if (!query) return [];

  return await handler(query, 100, site);
}

export async function exportPdsuAnalyticsXlsx(site) {
  const [software, drivers, services, updates, printers] = await Promise.all([
    getAllSoftwareForExport(site),
    getAllDriversForExport(site),
    getAllServicesForExport(site),
    getAllUpdatesForExport(site),
    getAllPrintersForExport(site),
  ]);

  return { software, drivers, services, updates, printers };
}
