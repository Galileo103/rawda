import { describe, expect, it } from 'vitest'
import { visualKey } from '../content/parse'
import type { ChoiceItem, Visual } from '../content/schemas'
import { applyOutcome } from '../domain/engine/mastery'
import { seededRng } from '../domain/rng'
import { ageProfile } from '../domain/ageProfile'
import { buildChoices, numberChoices, optionsToHide } from './activities/choices'
import { isBreakDue } from './activities/sessionStats'
import { computeStats } from './parent/progressStats'
import { coverPoints, floodFill, maskPoints, pointParts, traceThreshold, weakestPart } from './studio/canvasTools'

const glyph = (t: string): Visual => ({ kind: 'glyph', text: t })

describe('choices', () => {
  const pool = ['A', 'B', 'C', 'D', 'E', 'F'].map(glyph)
  const item = (difficulty: number): ChoiceItem => ({ id: 'b', skill: 's', difficulty, say: { en: 'Find B' }, answer: glyph('B') })

  it('includes the answer, has no duplicates and grows with difficulty', () => {
    for (const [d, n] of [[1, 2], [2, 3], [4, 4]] as const) {
      const c = buildChoices(item(d), pool, seededRng(d))
      expect(c).toHaveLength(n)
      expect(c.map(visualKey)).toContain('glyph:B')
      expect(new Set(c.map(visualKey)).size).toBe(n)
    }
  })

  it('age profiles: younger children see fewer options, never fewer than 2', () => {
    const young = ageProfile('3-4')
    expect(buildChoices(item(5), pool, seededRng(1), young.maxChoices)).toHaveLength(3)
    const explicit = { ...item(1), choices: [glyph('B'), glyph('X'), glyph('Y'), glyph('Z')] }
    const trimmed = buildChoices(explicit, pool, seededRng(2), young.maxChoices)
    expect(trimmed).toHaveLength(3)
    expect(trimmed.map(visualKey)).toContain('glyph:B')
    expect(numberChoices(5, 5, seededRng(3), 10, young.maxChoices)).toHaveLength(3)
    expect(ageProfile(undefined)).toEqual(ageProfile('4-5'))
    expect(ageProfile('3-4').idleMs).toBeLessThan(ageProfile('5-6').idleMs)
    expect(ageProfile('3-4').sessionCap).toBeLessThan(ageProfile('5-6').sessionCap)
  })

  it('movement breaks come every few finished activities', () => {
    expect([1, 2, 3, 4, 5, 6].filter((n) => isBreakDue(n, 3))).toEqual([3, 6])
    expect(isBreakDue(0, 3)).toBe(false)
    expect(isBreakDue(4, 0)).toBe(false)
  })

  it('keeps explicit choices exactly', () => {
    const explicit = { ...item(1), choices: [glyph('B'), glyph('X'), glyph('Y')] }
    expect(buildChoices(explicit, pool, seededRng(1)).map(visualKey).sort()).toEqual(['glyph:B', 'glyph:X', 'glyph:Y'])
  })

  it('number options stay in 1..10, unique, near the answer', () => {
    for (let n = 1; n <= 10; n++) {
      const c = numberChoices(n, 4, seededRng(n))
      expect(c).toContain(n)
      expect(new Set(c).size).toBe(c.length)
      expect(c.every((x) => x >= 1 && x <= 10)).toBe(true)
    }
  })

  it('hint level 2 reduces to the answer plus one untried option', () => {
    const keys = ['a', 'b', 'c', 'd']
    expect(optionsToHide(keys, 'a', new Set(), 1).size).toBe(0)
    const hidden = optionsToHide(keys, 'a', new Set(['b']), 2)
    expect(hidden.has('a')).toBe(false)
    expect(keys.filter((k) => !hidden.has(k))).toEqual(['a', 'c'])
  })
})

describe('paint bucket', () => {
  /** 10×10 white layer; a vertical "line" wall at x=5 on the boundary layer. */
  function setup() {
    const w = 10
    const h = 10
    const layer = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
    const boundary = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
    for (let y = 0; y < h; y++) {
      const i = (y * w + 5) * 4
      boundary.data.set([0, 0, 0, 255], i)
    }
    return { layer, boundary, at: (x: number, y: number) => [...layer.data.slice((y * w + x) * 4, (y * w + x) * 4 + 4)] }
  }

  it('fills the tapped region and stops at coloring-page lines', () => {
    const { layer, boundary, at } = setup()
    expect(floodFill(layer, boundary, 1, 1, [255, 0, 0, 255])).toBe(true)
    expect(at(0, 0)).toEqual([255, 0, 0, 255])
    expect(at(4, 9)).toEqual([255, 0, 0, 255])
    expect(at(7, 3)).toEqual([0, 0, 0, 0]) // other side of the line untouched
  })

  it('does nothing when tapping a line or re-filling the same colour', () => {
    const { layer, boundary } = setup()
    expect(floodFill(layer, boundary, 5, 5, [255, 0, 0, 255])).toBe(false)
    floodFill(layer, boundary, 1, 1, [255, 0, 0, 255])
    expect(floodFill(layer, boundary, 1, 1, [255, 0, 0, 255])).toBe(false)
  })
})

describe('tracing', () => {
  it('samples the painted shape and counts coverage as the finger moves', () => {
    const w = 40
    const buf = { width: w, height: w, data: new Uint8ClampedArray(w * w * 4) }
    // A vertical bar (x 16..24) is the "letter".
    for (let y = 0; y < w; y++) for (let x = 16; x < 24; x++) buf.data[(y * w + x) * 4 + 3] = 255
    const pts = maskPoints(buf, 4)
    expect(pts.length / 2).toBe(20) // 2 columns × 10 rows of samples
    const covered = new Uint8Array(pts.length / 2)
    expect(coverPoints(pts, covered, 20, 2, 5)).toBeGreaterThan(0)
    for (let y = 0; y < w; y += 4) coverPoints(pts, covered, 20, y, 5)
    expect(covered.every((v) => v === 1)).toBe(true)
    expect(coverPoints(pts, covered, 20, 20, 5)).toBe(0) // nothing new to cover
  })

  it('needs most of the shape, lowered by hints but never trivial', () => {
    expect(traceThreshold(0)).toBeCloseTo(0.85)
    expect(traceThreshold(1)).toBeLessThan(traceThreshold(0))
    expect(traceThreshold(3)).toBe(0.55)
  })

  it('finds the separate parts of a letter, so the dot of ب has to be traced too', () => {
    // A bar of 10 points and, apart from it, a dot of 3 points.
    const bar = Array.from({ length: 10 }, (_, i) => [6 + i * 12, 6])
    const dot = [
      [66, 78],
      [78, 78],
      [66, 90],
    ]
    const pts = Float32Array.from([...bar, ...dot].flat())
    const parts = pointParts(pts)
    expect(parts.count).toBe(2)
    const covered = new Uint8Array(13)
    covered.fill(1, 0, 10) // the whole bar, no dot
    expect(weakestPart(covered, parts)).toBe(0)
    covered.fill(1, 10, 12)
    expect(weakestPart(covered, parts)).toBeCloseTo(2 / 3)
  })
})

describe('new visual kinds', () => {
  it('phrases and rows have stable keys', () => {
    const p: Visual = { kind: 'phrase', text: { ar: 'بِسْمِ اللهِ', en: 'Bismillah' } }
    expect(visualKey(p)).toBe('phrase:بِسْمِ اللهِ')
    const r: Visual = { kind: 'row', question: true, items: [{ kind: 'glyph', text: 'A' }, { kind: 'glyph', text: 'B' }] }
    expect(visualKey(r)).toBe('row:glyph:A,glyph:B')
  })
})

describe('parent progress summary', () => {
  it('groups by area and language without diagnosing', () => {
    const ok = { firstTry: true, misses: 0, hintsUsed: 0 }
    let ar = applyOutcome(undefined, 'color.red', 'ar', ok, 1)
    for (let i = 0; i < 4; i++) ar = applyOutcome(ar, 'color.red', 'ar', ok, 2 + i)
    const en = applyOutcome(undefined, 'color.red', 'en', { firstTry: false, misses: 3, hintsUsed: 0 }, 1)
    const stats = computeStats([{ activityId: 'colors', areaId: 'colors-shapes', lang: 'ar', items: 5, stars: 5, ts: 1 }], [ar, en], new Map([['color.red', 'colors-shapes']]))
    expect(stats.activitiesDone).toBe(1)
    expect(stats.stars).toBe(5)
    expect(stats.byLang.get('ar')?.mastered).toBe(1)
    expect(stats.byLang.get('en')?.mastered).toBe(0)
    expect(stats.byArea.get('colors-shapes')?.practiced).toBe(2)
    expect(stats.recent.map((r) => r.key)).toEqual(['color.red|ar'])
  })
})
