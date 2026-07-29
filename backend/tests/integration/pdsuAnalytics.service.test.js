import { describe, it, expect } from "vitest";
import { listComputersWithoutUltravncService } from "../../services/pdsuAnalytics.service.js";
import { syncComputerServices } from "../../services/pdsu.service.js";
import { createService } from "../../services/ipAddresses.service.js";
import { deleteTestIpEntry, testIp } from "../helpers/testDb.js";

describe("listComputersWithoutUltravncService (integration, real DB)", () => {
  it(
    "excludes a computer with a uvnc-like service (case-insensitive substring), " +
      "includes one with unrelated services (hasServiceData=true) and one with " +
      "no service inventory at all (hasServiceData=false)",
    async () => {
      const withUvnc = await createService({ ip: testIp(), entryType: "computer" });
      const withoutUvnc = await createService({ ip: testIp(), entryType: "computer" });
      const noServiceData = await createService({ ip: testIp(), entryType: "computer" });

      try {
        await syncComputerServices(withUvnc.id, [
          { name: "uvnc_service", displayName: "UltraVNC Server", state: "Running" },
        ]);
        await syncComputerServices(withoutUvnc.id, [
          { name: "Spooler", displayName: "Print Spooler", state: "Running" },
        ]);

        const { items } = await listComputersWithoutUltravncService();
        const ids = items.map((i) => i.id);

        expect(ids).not.toContain(withUvnc.id);
        expect(ids).toContain(withoutUvnc.id);
        expect(ids).toContain(noServiceData.id);

        const withoutUvncItem = items.find((i) => i.id === withoutUvnc.id);
        expect(Number(withoutUvncItem.hasServiceData)).toBe(1);

        const noServiceDataItem = items.find((i) => i.id === noServiceData.id);
        expect(Number(noServiceDataItem.hasServiceData)).toBe(0);
      } finally {
        await deleteTestIpEntry(withUvnc.id);
        await deleteTestIpEntry(withoutUvnc.id);
        await deleteTestIpEntry(noServiceData.id);
      }
    },
  );
});
