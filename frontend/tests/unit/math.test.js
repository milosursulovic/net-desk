import { describe, it, expect } from 'vitest'
import {
  sum,
  avg,
  median,
  round1,
  joinNonEmpty,
  maxOf,
  barWidth,
  groupCount,
} from '@/utils/math.js'

describe('sum', () => {
  it('sums numeric values', () => {
    expect(sum([1, 2, 3])).toBe(6)
  })

  it('treats non-numeric entries as 0 instead of throwing/NaN', () => {
    expect(sum([1, 'x', null, undefined, 3])).toBe(4)
  })

  it('returns 0 for an empty array', () => {
    expect(sum([])).toBe(0)
  })
})

describe('avg', () => {
  it('averages a non-empty array', () => {
    expect(avg([2, 4, 6])).toBe(4)
  })

  it('returns 0 for an empty array instead of NaN', () => {
    expect(avg([])).toBe(0)
  })
})

describe('median', () => {
  it('returns 0 for an empty array', () => {
    expect(median([])).toBe(0)
  })

  it('returns the middle value for an odd-length array', () => {
    expect(median([5, 1, 3])).toBe(3)
  })

  it('averages the two middle values for an even-length array', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('does not mutate the input array', () => {
    const input = [3, 1, 2]
    median(input)
    expect(input).toEqual([3, 1, 2])
  })
})

describe('round1', () => {
  it('rounds to 1 decimal place', () => {
    expect(round1(1.234)).toBe(1.2)
    expect(round1(1.26)).toBe(1.3)
  })

  it('returns 0 for non-finite input (NaN/Infinity) instead of propagating it', () => {
    expect(round1(NaN)).toBe(0)
    expect(round1(Infinity)).toBe(0)
  })
})

describe('joinNonEmpty', () => {
  it('filters out falsy entries before joining', () => {
    expect(joinNonEmpty(['a', '', null, 'b', undefined, 0], ' ')).toBe('a b')
  })

  it('returns an empty string when everything is falsy', () => {
    expect(joinNonEmpty([null, '', undefined], ',')).toBe('')
  })
})

describe('maxOf', () => {
  it('returns the maximum value', () => {
    expect(maxOf([3, 7, 2])).toBe(7)
  })

  it('returns 0 for an empty array', () => {
    expect(maxOf([])).toBe(0)
  })
})

describe('barWidth', () => {
  it('returns 0 for a zero or negative value', () => {
    expect(barWidth(0, 100)).toBe(0)
    expect(barWidth(-5, 100)).toBe(0)
  })

  it('enforces a minimum visible width for a tiny non-zero share', () => {
    expect(barWidth(1, 1000)).toBe(2) // 0.1% would round to ~0, floored to minVisible
  })

  it('caps at 100 even if value exceeds maximum', () => {
    expect(barWidth(150, 100)).toBe(100)
  })

  it('computes a proportional width in the normal range', () => {
    expect(barWidth(50, 100)).toBe(50)
  })
})

describe('groupCount', () => {
  it('counts occurrences and sorts descending by count', () => {
    const result = groupCount(['a', 'b', 'a', 'c', 'a', 'b'])
    expect(result).toEqual([
      { key: 'a', count: 3 },
      { key: 'b', count: 2 },
      { key: 'c', count: 1 },
    ])
  })

  it('groups null/undefined/empty-string entries together under the em-dash key', () => {
    const result = groupCount([null, undefined, '', 'x'])
    expect(result).toContainEqual({ key: '—', count: 3 })
    expect(result).toContainEqual({ key: 'x', count: 1 })
  })

  it('returns an empty array for an empty input', () => {
    expect(groupCount([])).toEqual([])
  })
})
