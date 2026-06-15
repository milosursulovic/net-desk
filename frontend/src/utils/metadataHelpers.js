import { sum } from '@/utils/math.js'

export function totalRamGb(meta) {
  return (
    Number(meta?.System?.TotalRAM_GB) ||
    sum((meta?.RAMModules || []).map((r) => Number(r?.CapacityGB) || 0))
  )
}

export function cpuNameOf(x) {
  return (
    x?.CPU?.Name ||
    x?.Processor?.Name ||
    x?.System?.CPUName ||
    x?.System?.Processor ||
    x?.CPUName ||
    ''
  )
}

export function cpuCoresOf(x) {
  return (
    Number(x?.CPU?.Cores) ||
    Number(x?.Processor?.Cores) ||
    Number(x?.System?.CPUCores) ||
    Number(x?.CPU?.NumberOfCores) ||
    0
  )
}

export function cpuThreadsOf(x) {
  return (
    Number(x?.CPU?.LogicalCPUs) ||
    Number(x?.CPU?.LogicalProcessors) ||
    Number(x?.Processor?.LogicalProcessors) ||
    Number(x?.System?.CPULogicalProcessors) ||
    Number(x?.CPU?.Threads) ||
    0
  )
}

export function cpuClockGHzOf(x) {
  const ghz =
    Number(x?.CPU?.MaxClockGHz) ||
    Number(x?.Processor?.MaxClockGHz) ||
    Number(x?.System?.CPU_MaxClockGHz)
  if (Number.isFinite(ghz) && ghz > 0) return ghz
  const mhz =
    Number(x?.CPU?.MaxClockMHz) ||
    Number(x?.Processor?.MaxClockMHz) ||
    Number(x?.System?.CPU_MaxClockMHz)
  return Number.isFinite(mhz) && mhz > 0 ? Math.round((mhz / 1000) * 10) / 10 : 0
}
