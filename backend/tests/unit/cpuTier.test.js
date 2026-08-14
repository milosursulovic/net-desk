import { describe, it, expect } from "vitest";
import { classifyCpuTier } from "../../utils/cpuTier.js";

describe("classifyCpuTier", () => {
  it("classifies Intel Celeron/Pentium as weak", () => {
    expect(classifyCpuTier("Intel(R) Celeron(R) CPU        E3300  @ 2.50GHz")).toBe("weak");
    expect(classifyCpuTier("Intel(R) Celeron(R) G4900 CPU @ 3.10GHz")).toBe("weak");
    expect(classifyCpuTier("Intel(R) Pentium(R) CPU G4560 @ 3.50GHz")).toBe("weak");
  });

  it("classifies AMD Athlon/A-series as weak", () => {
    expect(classifyCpuTier("AMD Athlon II X2 250")).toBe("weak");
    expect(classifyCpuTier("AMD A6-7400K APU with Radeon(TM) R5 Graphics")).toBe("weak");
  });

  it("classifies Intel Core i3/i5/i7/i9 as strong, including newer 'Nth Gen' naming with no '@ GHz' suffix", () => {
    expect(classifyCpuTier("Intel(R) Core(TM) i3-10100 CPU @ 3.60GHz")).toBe("strong");
    expect(classifyCpuTier("Intel(R) Core(TM) i5-10500 CPU @ 3.10GHz")).toBe("strong");
    expect(classifyCpuTier("12th Gen Intel(R) Core(TM) i5-12400")).toBe("strong");
    expect(classifyCpuTier("Intel(R) Core(TM) i7-8700K CPU @ 3.70GHz")).toBe("strong");
    expect(classifyCpuTier("Intel(R) Core(TM) i9-9900K CPU @ 3.60GHz")).toBe("strong");
  });

  it("classifies AMD Ryzen as strong", () => {
    expect(classifyCpuTier("AMD Ryzen 5 PRO 4650G with Radeon Graphics")).toBe("strong");
    expect(classifyCpuTier("AMD Ryzen 5 5600GT with Radeon Graphics")).toBe("strong");
  });

  it("leaves ambiguous CPUs (Xeon, unknown) unclassified rather than guessing", () => {
    expect(classifyCpuTier("Intel(R) Xeon(R) CPU           E5506  @ 2.13GHz")).toBeNull();
  });

  it("handles missing/empty input without throwing", () => {
    expect(classifyCpuTier(null)).toBeNull();
    expect(classifyCpuTier(undefined)).toBeNull();
    expect(classifyCpuTier("")).toBeNull();
  });
});
