import { describe, expect, it } from 'vitest'
import discover from '../../../content/activities/logic/logic-discover.json'
import patterns from '../../../content/activities/logic/patterns.json'
import { seededRng } from '../rng'
import { pickLessonItems, pickSessionItems } from './scheduler'

/** Age-appropriateness: ABC patterns (difficulty 5) only reach children on higher levels. */
describe('ABC patterns and the difficulty level', () => {
  const items = patterns.items
  const abc = <T extends { skill: string }>(picked: T[]) => picked.filter((i) => i.skill === 'logic.pattern.abc')
  const pick = (level: number, focus?: string[]) =>
    pickSessionItems(items, { lang: 'en', level, mastery: new Map(), now: 0, count: items.length, rng: seededRng(7), focusSkills: focus ? new Set(focus) : undefined })

  it('has ABC items, all at difficulty 5', () => {
    const all = abc(items)
    expect(all.length).toBeGreaterThanOrEqual(3)
    expect(all.every((i) => i.difficulty === 5)).toBe(true)
  })

  it('keeps ABC out on levels 1–3 and lets it in on levels 4 (stretch) and 5', () => {
    for (const level of [1, 2, 3]) expect(abc(pick(level))).toHaveLength(0)
    expect(abc(pick(4)).length).toBeGreaterThan(0)
    expect(abc(pick(5)).length).toBeGreaterThan(0)
  })

  it('after AB/ABB lessons, practice stays on them until the ABC lesson is taken', () => {
    expect(abc(pick(5, ['logic.pattern.ab', 'logic.pattern.abb']))).toHaveLength(0)
    expect(abc(pick(5, ['logic.pattern.ab', 'logic.pattern.abb', 'logic.pattern.abc'])).length).toBeGreaterThan(0)
  })

  it('never hands the ABC lesson out below level 5, so ABC practice stays out on levels 1–3', () => {
    const lessonFor = (level: number, taken: string[]) => pickLessonItems(discover.items, new Set(taken), 1, level)[0]?.id
    const allButAbc = discover.items.filter((i) => i.id !== 'pattern-abc').map((i) => i.id)
    for (const level of [1, 2, 3, 4]) {
      expect(lessonFor(level, allButAbc)).not.toBe('pattern-abc')
      // Discover keeps cycling the lessons for this level; practice keeps to AB/ABB.
      expect(abc(pick(level, ['logic.pattern.ab', 'logic.pattern.abb']))).toHaveLength(0)
    }
    expect(lessonFor(5, allButAbc)).toBe('pattern-abc')
  })
})
