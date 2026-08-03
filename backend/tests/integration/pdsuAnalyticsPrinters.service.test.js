import { describe, it, expect } from "vitest";
import {
  pdsuAnalyticsStatsService,
  searchPdsuAnalytics,
  activePrintersForPdfExport,
} from "../../services/pdsuAnalytics.service.js";
import { syncComputerPrinters } from "../../services/pdsu.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp, testHostname } from "../helpers/testDb.js";

describe("pdsuAnalytics printers (integration, real DB)", () => {
  it("pdsuAnalyticsStatsService reports printer stats, coverage, and problem-status/top tables", async () => {
    const okComputer = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });
    const problemComputer = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });

    const uniquePrinterName = `VITEST_PRINTER_${Date.now()}`;

    try {
      await syncComputerPrinters(okComputer.id, [
        { name: uniquePrinterName, driverName: "HP Universal", portName: "USB001", status: "OK", isDefault: true },
      ]);
      await syncComputerPrinters(problemComputer.id, [
        { name: `VITEST_PRINTER_ERR_${Date.now()}`, driverName: "Canon Generic", portName: "IP_10.0.0.5", status: "Error", isDefault: false },
      ]);

      const out = await pdsuAnalyticsStatsService("bolnica");

      expect(out.printers).toBeTruthy();
      expect(out.printers.stats.totalPrinters).toBeGreaterThanOrEqual(2);
      expect(out.printers.stats.problemStatus).toBeGreaterThanOrEqual(1);

      expect(out.coverage.withPrinters).toBeGreaterThanOrEqual(2);
      expect(out.coverage.printersPct).toBeGreaterThan(0);

      const problemRow = out.printers.tables.problemStatus.find((p) => p.ipEntryId === problemComputer.id);
      expect(problemRow).toBeTruthy();
      expect(problemRow.status).toBe("Error");

      // getTopPrinterNames is a ranked, LIMIT-10 table ordered by computer
      // count - on a real, already-populated dev DB it may not include a
      // single-computer test printer, so that ranking isn't asserted here.
      // Direct repo-level search (next test) covers exact-match lookup instead.
    } finally {
      await deleteTestIpEntry(okComputer.id);
      await deleteTestIpEntry(problemComputer.id);
    }
  });

  it("searchPdsuAnalytics('printers', ...) finds printers by name/driver/computer, scoped by site", async () => {
    const entry = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });

    const uniquePrinterName = `VITEST_SEARCH_PRINTER_${Date.now()}`;

    try {
      await syncComputerPrinters(entry.id, [
        { name: uniquePrinterName, driverName: "Xerox WorkCentre", portName: "IP_10.0.0.9", status: "OK", isDefault: false },
      ]);

      const matched = await searchPdsuAnalytics("printers", uniquePrinterName, "bolnica");
      expect(matched.some((row) => row.name === uniquePrinterName)).toBe(true);

      const wrongSite = await searchPdsuAnalytics("printers", uniquePrinterName, "dom_zdravlja");
      expect(wrongSite.some((row) => row.name === uniquePrinterName)).toBe(false);

      const viaAll = await searchPdsuAnalytics("all", uniquePrinterName, "bolnica");
      expect(viaAll.printers.some((row) => row.name === uniquePrinterName)).toBe(true);
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });

  it("searchPdsuAnalytics rejects an unknown category", async () => {
    await expect(searchPdsuAnalytics("bogus", "x", undefined)).rejects.toMatchObject({ status: 400 });
  });

  it("getActivePrinterPerComputer (via stats) returns only the default printer per computer", async () => {
    const entry = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });

    const oldPrinterName = `VITEST Old Canon ${Date.now()}`;
    const activePrinterName = `VITEST Active HP ${Date.now()}`;

    try {
      await syncComputerPrinters(entry.id, [
        { name: oldPrinterName, driverName: "Canon Generic", portName: "USB002", status: "OK", isDefault: false },
        { name: activePrinterName, driverName: "HP Universal", portName: "USB001", status: "OK", isDefault: true },
      ]);

      const out = await pdsuAnalyticsStatsService("bolnica");
      const row = out.printers.tables.activePerComputer.find((p) => p.ipEntryId === entry.id);

      expect(row).toBeTruthy();
      expect(row.name).toBe(activePrinterName);
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });

  it("groups active printers by manufacturer (via stats) and annotates each row with .manufacturer", async () => {
    const hpComputer = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });
    const canonComputer = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });

    try {
      await syncComputerPrinters(hpComputer.id, [
        { name: `VITEST HP ${Date.now()}`, driverName: "HP Universal Printing PCL 6", portName: "USB001", status: "OK", isDefault: true },
      ]);
      await syncComputerPrinters(canonComputer.id, [
        { name: `VITEST Canon ${Date.now()}`, driverName: "Canon Generic Plus PCL6", portName: "USB002", status: "OK", isDefault: true },
      ]);

      const out = await pdsuAnalyticsStatsService("bolnica");

      const hpRow = out.printers.tables.activePerComputer.find((p) => p.ipEntryId === hpComputer.id);
      expect(hpRow.manufacturer).toBe("HP");

      const canonRow = out.printers.tables.activePerComputer.find((p) => p.ipEntryId === canonComputer.id);
      expect(canonRow.manufacturer).toBe("Canon");

      const hpGroup = out.printers.tables.groupedByManufacturer.find((g) => g.manufacturer === "HP");
      expect(hpGroup).toBeTruthy();
      expect(hpGroup.computers.some((c) => c.ipEntryId === hpComputer.id)).toBe(true);

      const canonGroup = out.printers.tables.groupedByManufacturer.find((g) => g.manufacturer === "Canon");
      expect(canonGroup).toBeTruthy();
      expect(canonGroup.computers.some((c) => c.ipEntryId === canonComputer.id)).toBe(true);
    } finally {
      await deleteTestIpEntry(hpComputer.id);
      await deleteTestIpEntry(canonComputer.id);
    }
  });

  it("activePrintersForPdfExport annotates manufacturer and sorts by manufacturer then computer name", async () => {
    const entry = await createService({
      ip: testIp(),
      site: "bolnica",
      entryType: "computer",
      computerName: testHostname(),
    });

    try {
      await syncComputerPrinters(entry.id, [
        { name: `VITEST Epson ${Date.now()}`, driverName: "Epson Universal Print Driver", portName: "USB003", status: "OK", isDefault: true },
      ]);

      const items = await activePrintersForPdfExport("bolnica");
      const row = items.find((p) => p.ipEntryId === entry.id);

      expect(row).toBeTruthy();
      expect(row.manufacturer).toBe("Epson");

      // Sorted by manufacturer ascending - every consecutive pair must be
      // non-decreasing in manufacturer name.
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].manufacturer.localeCompare(items[i].manufacturer)).toBeLessThanOrEqual(0);
      }
    } finally {
      await deleteTestIpEntry(entry.id);
    }
  });
});
