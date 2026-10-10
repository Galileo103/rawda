import { describe, expect, it } from 'vitest'
import type { MasteryRecord } from './engine/mastery'
import { daysAgo, pickReview, reviewCard } from './remember'

const DAY = 86_400_000
const now = new Date(2026, 9, 10, 10).getTime()
const rec = (skillId: string, p: Partial<MasteryRecord> = {}): MasteryRecord => ({
  key: `${skillId}|ar`,
  skillId,
  lang: 'ar',
  score: 0.5,
  box: 2,
  attempts: 2,
  firstTryCorrect: 1,
  lastSeen: now - 3 * DAY,
  dueAt: now - DAY,
  ...p,
})

describe('Remember Box', () => {
  it('turns letters, numbers, colours and shapes into one-tap cards (and nothing else)', () => {
    expect(reviewCard('ar.letter.ba', 'ar')).toEqual({ skill: 'ar.letter.ba', kind: 'letter', id: 'ba' })
    expect(reviewCard('en.letter.b', 'ar')).toBeUndefined()
    expect(reviewCard('num.count.4', 'ar')).toMatchObject({ kind: 'number', n: 4 })
    expect(reviewCard('color.red', 'en')).toMatchObject({ kind: 'color', color: 'red' })
    expect(reviewCard('shape.circle', 'en')).toMatchObject({ kind: 'shape', shape: 'circle' })
    expect(reviewCard('sci.food.cow', 'ar')).toBeUndefined()
  })

  it('brings back only what is due, discovered, and learned before today — weakest first, three at most', () => {
    const introduced = new Set(['ar.letter.ba', 'ar.letter.ta', 'num.count.3', 'color.red', 'shape.circle', 'num.count.9'])
    const records = [
      rec('ar.letter.ba', { score: 0.9 }),
      rec('ar.letter.ta', { score: 0.2 }),
      rec('num.count.3', { score: 0.4 }),
      rec('color.red', { dueAt: now + DAY }), // not due yet
      rec('shape.circle', { lastSeen: now - 60_000 }), // seen today: that is not remembering
      rec('num.count.7', { score: 0.1 }), // never discovered
      rec('num.count.9', { lang: 'en', key: 'num.count.9|en' }), // other language
    ]
    expect(pickReview(records, introduced, 'ar', now).map((x) => x.record.skillId)).toEqual(['ar.letter.ta', 'num.count.3', 'ar.letter.ba'])
    expect(pickReview([], introduced, 'ar', now)).toEqual([])
  })

  it('counts whole days since the child last saw it', () => {
    expect(daysAgo(now - 3 * DAY, now)).toBe(3)
    expect(daysAgo(now - 60_000, now)).toBe(1)
  })
})
