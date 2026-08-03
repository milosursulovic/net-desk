import { describe, it, expect } from "vitest";
import { pdsuAnalyticsStatsService, searchPdsuAnalytics } from "../../services/pdsuAnalytics.service.js";
import { syncComputerPrinters, getComputerPrinters } from "../../services/pdsu.service.js";
import {
  addIgnoredPrinterPatternService,
  removeIgnoredPrinterPatternService,
} from "../../services/printerPatterns.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp, testHostname } from "../helpers/testDb.js";
import { pool } from "../../db/pool.js";

async function deleteIgnoredPatternByText(pattern) {
  await pool.execute("DELETE FROM ignored_printer_patterns WHERE pattern = ?", [pattern.toLowerCase()]);
}

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

  describe("ignored printer patterns (virtual/software printers)", () => {
    it("addIgnoredPrinterPatternService rejects a duplicate (case-insensitive)", async () => {
      const pattern = `vitest print to pdf ${Date.now()}`;
      try {
        await addIgnoredPrinterPatternService({ pattern }, null);
        await expect(
          addIgnoredPrinterPatternService({ pattern: pattern.toUpperCase() }, null),
        ).rejects.toMatchObject({ status: 400 });
      } finally {
        await deleteIgnoredPatternByText(pattern);
      }
    });

    it("removeIgnoredPrinterPatternService deletes the entry", async () => {
      const pattern = `vitest anydesk printer ${Date.now()}`;
      const created = await addIgnoredPrinterPatternService({ pattern }, null);
      const out = await removeIgnoredPrinterPatternService(created.id);
      expect(out.affected).toBe(1);
    });

    it("a matching pattern hides the printer from the per-computer list, search, and stats", async () => {
      const entry = await createService({
        ip: testIp(),
        site: "bolnica",
        entryType: "computer",
        computerName: testHostname(),
      });

      const virtualPrinterName = `VITEST Microsoft Print to PDF ${Date.now()}`;
      const realPrinterName = `VITEST HP LaserJet ${Date.now()}`;
      const pattern = "print to pdf";

      try {
        await syncComputerPrinters(entry.id, [
          { name: virtualPrinterName, driverName: "Microsoft", portName: "PORTPROMPT:", status: "OK", isDefault: false },
          { name: realPrinterName, driverName: "HP Universal", portName: "USB001", status: "OK", isDefault: true },
        ]);

        // Before ignoring: both printers are visible.
        const beforeList = await getComputerPrinters(entry.id);
        expect(beforeList.some((p) => p.name === virtualPrinterName)).toBe(true);

        await addIgnoredPrinterPatternService({ pattern }, null);

        const afterList = await getComputerPrinters(entry.id);
        expect(afterList.some((p) => p.name === virtualPrinterName)).toBe(false);
        expect(afterList.some((p) => p.name === realPrinterName)).toBe(true);

        const searchResult = await searchPdsuAnalytics("printers", virtualPrinterName, "bolnica");
        expect(searchResult).toHaveLength(0);

        const realSearchResult = await searchPdsuAnalytics("printers", realPrinterName, "bolnica");
        expect(realSearchResult.some((p) => p.name === realPrinterName)).toBe(true);
      } finally {
        await deleteIgnoredPatternByText(pattern);
        await deleteTestIpEntry(entry.id);
      }
    });

    it("getActivePrinterPerComputer (via stats) returns only the default, non-virtual printer per computer", async () => {
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
  });
});
