import { describe, expect, it } from 'vitest'
import { cumulativeOrder, pauseFor } from './sequence'

describe('الربط التراكمي', () => {
  it('learns each new ayah alone, then joins it to all before it', () => {
    expect(cumulativeOrder([1, 2, 3, 4])).toEqual([1, 2, 1, 2, 3, 1, 2, 3, 4, 1, 2, 3, 4])
  })
  it('a one-ayah list is just that ayah; empty stays empty', () => {
    expect(cumulativeOrder([7])).toEqual([7])
    expect(cumulativeOrder([])).toEqual([])
  })
})

describe('repeat pause', () => {
  it('lasts about as long as the ayah, between 2 and 15 seconds', () => {
    expect(pauseFor(4.2)).toBe(4200)
    expect(pauseFor(0.5)).toBe(2000)
    expect(pauseFor(40)).toBe(15000)
    expect(pauseFor(Number.NaN)).toBe(3000)
  })
})
