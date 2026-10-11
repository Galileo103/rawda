import { describe, expect, it } from 'vitest'
import { content } from '../../content/loader'
import { computePillars } from './pillarStats'
import { practiceToday } from './progressStats'

const NOW = new Date('2026-10-11T15:00:00').getTime()
const HOUR = 3_600_000

describe('parent progress: today', () => {
  it('counts distinct concepts practised today, per area, ignoring earlier days', () => {
    const today = practiceToday(
      [
        { ts: NOW - HOUR, areaId: 'colors-shapes', skill: 'color.red', lang: 'ar' },
        { ts: NOW - HOUR, areaId: 'colors-shapes', skill: 'color.red', lang: 'ar' }, // same concept twice
        { ts: NOW - HOUR, areaId: 'colors-shapes', skill: 'color.blue', lang: 'ar' },
        { ts: NOW - 2 * HOUR, areaId: 'letters', skill: 'ar.letter.ba', lang: 'ar' },
        { ts: NOW - 30 * HOUR, areaId: 'numbers', skill: 'num.3', lang: 'ar' }, // yesterday
      ],
      NOW,
    )
    expect(today).toEqual([
      { area: 'colors-shapes', concepts: 2 },
      { area: 'letters', concepts: 1 },
    ])
  })
})

describe('parent progress: 14-day chart', () => {
  it('shows a Colors activity as "other learning", so the chart never says nothing happened', () => {
    const colors = content.activities.find((a) => a.id === 'colors')
    expect(colors).toBeDefined()
    const dash = computePillars({
      attempts: [{ activityId: 'colors', skill: 'color.red', firstTry: true, ts: NOW - HOUR }],
      mastery: [],
      drawings: [],
      activities: content.activities,
      now: NOW,
    })
    const today = dash.days[dash.days.length - 1]!
    expect(today.other).toBe(1)
    expect(dash.streakDays).toBe(1)
  })
})
