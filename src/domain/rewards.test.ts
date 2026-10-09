import { describe, expect, it } from 'vitest'
import { applyOutcome } from './engine/mastery'
import { recommendNext } from './recommend'
import { rewardsToGrant, starsForSession } from './rewards'

const defs = [
  { id: 'a', rule: { type: 'activity' as const, activityId: 'act-1' } },
  { id: 's10', rule: { type: 'stars' as const, total: 10 } },
  { id: 'story', rule: { type: 'story' as const, storyId: 'lulu' } },
  { id: 'draw', rule: { type: 'drawings' as const, count: 1 } },
]
const empty = { completedActivityIds: new Set<string>(), finishedStoryIds: new Set<string>(), totalStars: 0, drawingsCount: 0 }

describe('rewards', () => {
  it('grants only satisfied, not-yet-owned rewards (idempotent)', () => {
    const ctx = { ...empty, completedActivityIds: new Set(['act-1']), totalStars: 12 }
    expect(rewardsToGrant(defs, ctx, new Set()).map((d) => d.id)).toEqual(['a', 's10'])
    expect(rewardsToGrant(defs, ctx, new Set(['a', 's10']))).toEqual([])
  })

  it('covers stories and drawings', () => {
    const ctx = { ...empty, finishedStoryIds: new Set(['lulu']), drawingsCount: 1 }
    expect(rewardsToGrant(defs, ctx, new Set()).map((d) => d.id)).toEqual(['story', 'draw'])
  })

  it('rewards effort: stars never depend on mistakes and are at least 1', () => {
    expect(starsForSession(5)).toBe(5)
    expect(starsForSession(0)).toBe(1)
  })
})

describe('recommendNext', () => {
  const acts = [
    { id: 'x', level: 2, skills: ['s2'], lang: 'ar' as const },
    { id: 'y', level: 1, skills: ['s1'], lang: 'ar' as const },
  ]
  it('suggests the earliest activity not done yet', () => {
    expect(recommendNext(acts, new Set(), new Map())?.id).toBe('y')
    expect(recommendNext(acts, new Set(['y']), new Map())?.id).toBe('x')
  })
  it('when everything is done, suggests the weakest', () => {
    const strong = applyOutcome(undefined, 's1', 'ar', { firstTry: true, misses: 0, hintsUsed: 0 }, 1)
    expect(recommendNext(acts, new Set(['x', 'y']), new Map([[strong.key, strong]]))?.id).toBe('x')
  })
  it('can exclude the activity just played', () => {
    expect(recommendNext(acts, new Set(), new Map(), 'y')?.id).toBe('x')
  })
})
