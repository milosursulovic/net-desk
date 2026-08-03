import { describe, it, expect } from "vitest";
import { classifyPrinterManufacturer, groupByManufacturer } from "../../utils/printerManufacturer.js";

describe("classifyPrinterManufacturer", () => {
  it("detects a manufacturer from the driver name", () => {
    expect(classifyPrinterManufacturer({ driverName: "HP Universal Printing PCL 6", name: "Office" })).toBe("HP");
    expect(classifyPrinterManufacturer({ driverName: "Canon Generic Plus PCL6", name: "Reception" })).toBe("Canon");
    expect(classifyPrinterManufacturer({ driverName: "Xerox WorkCentre 6515 PS", name: "3rd floor" })).toBe("Xerox");
  });

  it("falls back to the printer name when the driver name doesn't match", () => {
    expect(classifyPrinterManufacturer({ driverName: "Generic driver", name: "Brother HL-L2350DW" })).toBe("Brother");
  });

  it("returns 'Nepoznato' when nothing matches", () => {
    expect(classifyPrinterManufacturer({ driverName: "Some Generic Driver", name: "Printer1" })).toBe("Nepoznato");
  });

  it("handles missing fields without throwing", () => {
    expect(classifyPrinterManufacturer({})).toBe("Nepoznato");
    expect(classifyPrinterManufacturer({ driverName: null, name: undefined })).toBe("Nepoznato");
  });
});

describe("groupByManufacturer", () => {
  it("groups annotated items by manufacturer, sorted by count descending", () => {
    const items = [
      { computerName: "PC-1", manufacturer: "HP" },
      { computerName: "PC-2", manufacturer: "HP" },
      { computerName: "PC-3", manufacturer: "Canon" },
    ];

    const groups = groupByManufacturer(items);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ manufacturer: "HP", count: 2 });
    expect(groups[1]).toMatchObject({ manufacturer: "Canon", count: 1 });
  });

  it("returns an empty array for no items", () => {
    expect(groupByManufacturer([])).toEqual([]);
  });
});
