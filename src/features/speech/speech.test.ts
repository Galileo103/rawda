import { describe, expect, it } from 'vitest'
import { content } from '../../content/loader'
import { pillarOf } from '../../domain/pillars'
import { computePillars } from '../parent/pillarStats'
import { normalizeSpeech, similarity, speechMatches } from './speechMatch'

describe('speech matching (on-device results, lenient for young children)', () => {
  it('ignores tashkeel, hamza forms, taa marbuta and "al-"', () => {
    expect(normalizeSpeech('تُفَّاحَة', 'ar')).toBe(normalizeSpeech('التفاحه', 'ar'))
    expect(normalizeSpeech('أَرْنَب', 'ar')).toBe('ارنب')
  })

  it('accepts the word inside a sentence and near-misses, rejects other words', () => {
    expect(speechMatches(['I said apple'], 'apple', 'en')).toBe(true)
    expect(speechMatches(['appo'], 'apple', 'en')).toBe(true) // child pronunciation
    expect(speechMatches(['banana'], 'apple', 'en')).toBe(false)
    expect(speechMatches(['تفاحه'], 'تُفَّاحَة', 'ar')).toBe(true)
    expect(speechMatches(['سمكه'], 'تُفَّاحَة', 'ar')).toBe(false)
    expect(speechMatches([], 'cat', 'en')).toBe(false)
    expect(similarity('cat', 'cat')).toBe(1)
  })
})

describe('four pillars', () => {
  it('activities map to pillars by how the child plays', () => {
    const byId = (id: string) => content.activities.find((a) => a.id === id)!
    expect(pillarOf(byId('ar-say-words'))).toBe('speech')
    expect(pillarOf(byId('finger-paths'))).toBe('motor')
    expect(pillarOf(byId('ar-trace'))).toBe('motor')
    expect(pillarOf(byId('sort-groups'))).toBe('logic')
    expect(pillarOf(byId('patterns'))).toBe('logic')
    expect(pillarOf(byId('colors'))).toBeUndefined()
  })

  it('summarises attempts, drawings, the 14-day chart, streak and milestones', () => {
    const DAY = 86_400_000
    const now = new Date('2026-10-10T12:00:00').getTime()
    const at = (activityId: string, daysAgo: number, extra: { firstTry?: boolean; quality?: number } = {}) => ({ activityId, skill: 'x', firstTry: extra.firstTry ?? true, quality: extra.quality, ts: now - daysAgo * DAY })
    const d = computePillars({
      now,
      activities: content.activities,
      mastery: [],
      attempts: [at('ar-say-words', 0, { quality: 1 }), at('ar-say-words', 1, { quality: 0.5 }), at('finger-paths', 2, { quality: 0.8 }), at('finger-paths', 20, { quality: 0.6 }), at('sort-groups', 0, { firstTry: false })],
      drawings: [{ createdAt: now - DAY }],
    })
    expect(d.pillars.speech.total).toBe(2)
    expect(d.wordsHeard).toBe(1)
    expect(d.pillars.motor.total).toBe(2)
    expect(d.pillars.motor.week).toBe(1)
    expect(d.pillars.motor.detail).toBeCloseTo(0.7)
    expect(d.pillars.logic.detail).toBe(0)
    expect(d.pillars.creativity.total).toBe(1)
    expect(d.days).toHaveLength(14)
    expect(d.days.at(-1)?.counts.speech).toBe(1)
    expect(d.streakDays).toBe(3) // today, yesterday, two days ago
    expect(d.milestones.find((m) => m.id === 'firstSort')?.done).toBe(true)
    expect(d.milestones.find((m) => m.id === 'tenWords')?.done).toBe(false)
  })
})
