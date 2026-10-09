import { describe, expect, it } from 'vitest'
import { seededRng } from '../rng'
import { choiceCountFor, effectiveLevel, initialLevelState, nextLevelState } from './difficulty'
import { BOX_INTERVALS, type MasteryRecord, applyOutcome, isMastered, masteryKey, needsPractice, outcomeValue } from './mastery'
import { pickLessonItems, pickSessionItems } from './scheduler'

const NOW = 1_700_000_000_000
const first = { firstTry: true, misses: 0, hintsUsed: 0 }
const struggled = { firstTry: false, misses: 3, hintsUsed: 1 }

describe('mastery', () => {
  it('keys progress separately per language', () => {
    expect(masteryKey('color.red', 'ar')).not.toBe(masteryKey('color.red', 'en'))
  })

  it('rises with first-try successes and reaches "mastered"', () => {
    let r: MasteryRecord | undefined
    for (let i = 0; i < 5; i++) r = applyOutcome(r, 'ar.letter.ba', 'ar', first, NOW + i)
    expect(r?.attempts).toBe(5)
    expect(r?.score).toBeGreaterThan(0.8)
    expect(isMastered(r)).toBe(true)
    expect(r?.box).toBe(5)
  })

  it('gives partial credit with help and moves gently on struggles (never below 0)', () => {
    expect(outcomeValue(first)).toBe(1)
    expect(outcomeValue({ firstTry: false, misses: 1, hintsUsed: 0 })).toBe(0.5)
    expect(outcomeValue(struggled)).toBe(0.25)
    let r = applyOutcome(undefined, 's', 'en', first, NOW)
    const before = r.score
    r = applyOutcome(r, 's', 'en', struggled, NOW + 1)
    expect(r.score).toBeLessThan(before)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.box).toBe(1)
  })

  it('schedules review by Leitner box and never depends on elapsed idle time', () => {
    const r1 = applyOutcome(undefined, 's', 'ar', first, NOW)
    expect(r1.dueAt).toBe(NOW + (BOX_INTERVALS[2] ?? 0))
    // Nothing is recomputed from the clock: a record looked at weeks later is unchanged.
    expect({ ...r1 }).toEqual(r1)
  })

  it('flags concepts worth practising only after a couple of attempts', () => {
    const once = applyOutcome(undefined, 's', 'ar', struggled, NOW)
    expect(needsPractice(once)).toBe(false)
    expect(needsPractice(applyOutcome(once, 's', 'ar', struggled, NOW))).toBe(true)
  })
})

describe('difficulty', () => {
  it('levels up after 3 first-try wins and down after 2 struggles', () => {
    let s = initialLevelState('letters', 'ar')
    for (let i = 0; i < 3; i++) s = nextLevelState(s, true)
    expect(s.level).toBe(2)
    s = nextLevelState(s, false)
    expect(s.level).toBe(2)
    s = nextLevelState(s, false)
    expect(s.level).toBe(1)
    s = nextLevelState(s, false)
    expect(s.level).toBe(1) // never below 1
  })

  it('lets a parent override win', () => {
    expect(effectiveLevel({ ...initialLevelState('numbers', 'en'), level: 4 }, 'auto')).toBe(4)
    expect(effectiveLevel({ ...initialLevelState('numbers', 'en'), level: 4 }, 2)).toBe(2)
    expect(effectiveLevel(undefined, 'auto')).toBe(1)
  })

  it('shows more options as difficulty grows', () => {
    expect([1, 2, 3, 4, 5].map(choiceCountFor)).toEqual([2, 3, 3, 4, 4])
  })
})

describe('scheduler', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, skill: `k${i}`, difficulty: 1 + Math.floor(i / 3) }))

  it('builds a session of the requested size from eligible difficulty', () => {
    const s = pickSessionItems(items, { lang: 'ar', level: 1, mastery: new Map(), now: NOW, count: 5, rng: seededRng(1) })
    expect(s).toHaveLength(5)
    expect(s.every((i) => i.difficulty <= 2)).toBe(true) // level-1 items, then stretch only to fill
  })

  it('is deterministic for a seed and never repeats an item back to back', () => {
    const a = pickSessionItems(items.slice(0, 3), { lang: 'en', level: 1, mastery: new Map(), now: NOW, count: 6, rng: seededRng(7) })
    const b = pickSessionItems(items.slice(0, 3), { lang: 'en', level: 1, mastery: new Map(), now: NOW, count: 6, rng: seededRng(7) })
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id))
    for (let i = 1; i < a.length; i++) expect(a[i]?.id).not.toBe(a[i - 1]?.id)
  })

  it('prioritises weak concepts for review', () => {
    const weak = applyOutcome(applyOutcome(undefined, 'k1', 'ar', struggled, NOW), 'k1', 'ar', struggled, NOW)
    const mastery = new Map([[weak.key, weak]])
    const s = pickSessionItems(items, { lang: 'ar', level: 1, mastery, now: NOW, count: 3, rng: seededRng(3) })
    expect(s.map((i) => i.id)).toContain('i1')
  })

  it('focuses practice on concepts taught in Discover lessons (when there are at least two)', () => {
    const taught = new Set(['k10', 'k11'])
    const s = pickSessionItems(items, { lang: 'ar', level: 1, mastery: new Map(), now: NOW, count: 4, rng: seededRng(9), focusSkills: taught })
    expect(new Set(s.map((i) => i.skill))).toEqual(taught) // even though they are above the current level
    const one = pickSessionItems(items, { lang: 'ar', level: 1, mastery: new Map(), now: NOW, count: 4, rng: seededRng(9), focusSkills: new Set(['k10']) })
    expect(one.every((i) => i.difficulty <= 2)).toBe(true) // a single taught concept doesn't restrict yet
  })

  it('Discover lessons go in curriculum order, one new concept at a time', () => {
    const lessons = [{ id: 'alif' }, { id: 'ba' }, { id: 'ta' }]
    expect(pickLessonItems(lessons, new Set(), 1).map((l) => l.id)).toEqual(['alif'])
    expect(pickLessonItems(lessons, new Set(['alif']), 1).map((l) => l.id)).toEqual(['ba'])
    expect(pickLessonItems(lessons, new Set(['alif', 'ba', 'ta']), 1).map((l) => l.id)).toEqual(['alif'])
  })

  it('only counts mastery in the session language', () => {
    let r: MasteryRecord | undefined
    for (let i = 0; i < 5; i++) r = applyOutcome(r, 'k0', 'ar', first, NOW)
    const mastery = new Map([[r!.key, r!]])
    // In English, k0 is still "new", so it's scheduled like any unseen item.
    const s = pickSessionItems(items.slice(0, 3), { lang: 'en', level: 1, mastery, now: NOW, count: 3, rng: seededRng(5) })
    expect(s.map((i) => i.id).sort()).toEqual(['i0', 'i1', 'i2'])
  })
})
