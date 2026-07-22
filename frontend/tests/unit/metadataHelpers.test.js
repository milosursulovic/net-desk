import { describe, it, expect } from 'vitest'
import {
  totalRamGb,
  cpuNameOf,
  cpuCoresOf,
  cpuThreadsOf,
  cpuClockGHzOf,
} from '@/utils/metadataHelpers.js'

describe('totalRamGb', () => {
  it('prefers System.TotalRAM_GB when present', () => {
    expect(totalRamGb({ System: { TotalRAM_GB: 32 }, RAMModules: [{ CapacityGB: 8 }] })).toBe(32)
  })

  it('falls back to summing RAMModules when TotalRAM_GB is absent', () => {
    expect(totalRamGb({ RAMModules: [{ CapacityGB: 8 }, { CapacityGB: 8 }] })).toBe(16)
  })

  it('returns 0 for completely missing data instead of throwing', () => {
    expect(totalRamGb({})).toBe(0)
    expect(totalRamGb(null)).toBe(0)
    expect(totalRamGb(undefined)).toBe(0)
  })
})

describe('cpuNameOf - namespace fallback chain (CPU -> Processor -> System.CPUName -> System.Processor -> CPUName)', () => {
  it('prefers CPU.Name (current agent shape)', () => {
    expect(cpuNameOf({ CPU: { Name: 'Ryzen 7' }, Processor: { Name: 'old' } })).toBe('Ryzen 7')
  })

  it('falls back to Processor.Name (legacy agent shape) when CPU is absent', () => {
    expect(cpuNameOf({ Processor: { Name: 'Core i5' } })).toBe('Core i5')
  })

  it('falls back to System.CPUName when both CPU and Processor are absent', () => {
    expect(cpuNameOf({ System: { CPUName: 'Xeon' } })).toBe('Xeon')
  })

  it('falls back to the flat CPUName as the last resort', () => {
    expect(cpuNameOf({ CPUName: 'Celeron' })).toBe('Celeron')
  })

  it('returns an empty string, not undefined, when nothing matches', () => {
    expect(cpuNameOf({})).toBe('')
    expect(cpuNameOf(null)).toBe('')
  })
})

describe('cpuCoresOf', () => {
  it('prefers CPU.Cores over the other namespaces', () => {
    expect(cpuCoresOf({ CPU: { Cores: 8 }, Processor: { Cores: 4 } })).toBe(8)
  })

  it('falls back down the chain to CPU.NumberOfCores as the last resort', () => {
    expect(cpuCoresOf({ CPU: { NumberOfCores: 6 } })).toBe(6)
  })

  it('returns 0 when nothing matches', () => {
    expect(cpuCoresOf({})).toBe(0)
  })
})

describe('cpuThreadsOf', () => {
  it('prefers CPU.LogicalCPUs', () => {
    expect(cpuThreadsOf({ CPU: { LogicalCPUs: 16 } })).toBe(16)
  })

  it('falls back to System.CPULogicalProcessors', () => {
    expect(cpuThreadsOf({ System: { CPULogicalProcessors: 4 } })).toBe(4)
  })

  it('returns 0 when nothing matches', () => {
    expect(cpuThreadsOf({})).toBe(0)
  })
})

describe('cpuClockGHzOf', () => {
  it('prefers a direct GHz value when present', () => {
    expect(cpuClockGHzOf({ CPU: { MaxClockGHz: 3.6 } })).toBe(3.6)
  })

  it('converts from MHz to GHz (rounded to 1 decimal) when no GHz value exists', () => {
    expect(cpuClockGHzOf({ CPU: { MaxClockMHz: 3600 } })).toBe(3.6)
  })

  it('falls back through Processor/System namespaces for the MHz value too', () => {
    expect(cpuClockGHzOf({ System: { CPU_MaxClockMHz: 2800 } })).toBe(2.8)
  })

  it('returns 0 when neither GHz nor MHz data exists', () => {
    expect(cpuClockGHzOf({})).toBe(0)
  })

  it('ignores a zero/negative GHz value and still tries the MHz fallback', () => {
    expect(cpuClockGHzOf({ CPU: { MaxClockGHz: 0, MaxClockMHz: 2400 } })).toBe(2.4)
  })
})
