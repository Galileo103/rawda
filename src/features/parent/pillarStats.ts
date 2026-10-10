import type { Activity, Pillar } from '../../content/schemas'
import { PILLARS } from '../../content/schemas'
import type { MasteryRecord } from '../../domain/engine/mastery'
import { pillarOf } from '../../domain/pillars'
import type { AttemptRow, DrawingRow } from '../../services/db'
import { localDay } from '../../services/db'

const DAY = 86_400_000

export interface PillarStat {
  pillar: Pillar
  /** Tasks finished in this pillar (all time). For creativity: drawings saved. */
  total: number
  /** Same, in the last 7 days. */
  week: number
  /**
   * 0..1 for the ring. Skill pillars: average mastery estimate of the skills practised.
   * Creativity has no "right answer", so it shows recent activity (drawings in 30 days, capped at 10).
   */
  level: number
  /** Pillar-specific figure for the caption (see PillarDashboard). */
  detail: number
}

export type MilestoneId = 'firstWord' | 'tenWords' | 'firstTrace' | 'tenTraces' | 'firstSort' | 'firstDrawing' | 'fiveDrawings' | 'streak3'

export interface PillarDashboard {
  pillars: Record<Pillar, PillarStat>
  /** Last 14 local days, oldest first. */
  days: { day: string; counts: Record<Pillar, number> }[]
  /** Consecutive days (ending today or yesterday) with any learning or drawing. */
  streakDays: number
  milestones: { id: MilestoneId; done: boolean }[]
  /** Words the device recognised on-device in "Say it!". */
  wordsHeard: number
}

const zero = (): Record<Pillar, number> => ({ speech: 0, logic: 0, motor: 0, creativity: 0 })

/** Pure summary for the four-pillar dashboard. Descriptive only — never a diagnosis. */
export function computePillars(input: {
  attempts: readonly Pick<AttemptRow, 'activityId' | 'skill' | 'firstTry' | 'quality' | 'ts'>[]
  mastery: readonly MasteryRecord[]
  drawings: readonly Pick<DrawingRow, 'createdAt'>[]
  activities: readonly Activity[]
  now?: number
}): PillarDashboard {
  const now = input.now ?? Date.now()
  const activityPillar = new Map<string, Pillar>()
  const skillPillar = new Map<string, Pillar>()
  const templateOf = new Map<string, Activity['template']>()
  for (const a of input.activities) {
    templateOf.set(a.id, a.template)
    const p = pillarOf(a)
    if (!p) continue
    activityPillar.set(a.id, p)
    for (const i of a.items as { skill: string }[]) if (!skillPillar.has(i.skill)) skillPillar.set(i.skill, p)
  }

  const total = zero()
  const week = zero()
  const firstTry = zero()
  const qualitySum = zero()
  const qualityN = zero()
  const today = localDay(now)
  const dayKeys = Array.from({ length: 14 }, (_, i) => localDay(now - (13 - i) * DAY))
  const byDay = new Map(dayKeys.map((d) => [d, zero()]))
  const activeDays = new Set<string>()
  let wordsHeard = 0
  let sorts = 0

  for (const a of input.attempts) {
    activeDays.add(localDay(a.ts))
    // Writing room colouring is fine-motor practice too.
    const p = activityPillar.get(a.activityId) ?? (a.activityId.startsWith('write:') ? 'motor' : undefined)
    if (!p) continue
    total[p]++
    if (now - a.ts < 7 * DAY) week[p]++
    if (a.firstTry) firstTry[p]++
    if (a.quality !== undefined) {
      qualitySum[p] += a.quality
      qualityN[p]++
    }
    if (p === 'speech' && a.quality === 1) wordsHeard++
    if (templateOf.get(a.activityId) === 'sort') sorts++
    const bucket = byDay.get(localDay(a.ts))
    if (bucket) bucket[p]++
  }
  for (const d of input.drawings) {
    activeDays.add(localDay(d.createdAt))
    total.creativity++
    if (now - d.createdAt < 7 * DAY) week.creativity++
    const bucket = byDay.get(localDay(d.createdAt))
    if (bucket) bucket.creativity++
  }

  const levelOf = (p: Pillar): number => {
    if (p === 'creativity') return Math.min(1, input.drawings.filter((d) => now - d.createdAt < 30 * DAY).length / 10)
    const recs = input.mastery.filter((m) => (skillPillar.get(m.skillId) ?? (m.skillId.includes('.write.') ? 'motor' : undefined)) === p)
    return recs.length ? recs.reduce((s, m) => s + m.score, 0) / recs.length : 0
  }
  const detailOf = (p: Pillar): number => {
    switch (p) {
      case 'speech':
        return total.speech
      case 'motor':
        return qualityN.motor ? qualitySum.motor / qualityN.motor : 0
      case 'logic':
        return total.logic ? firstTry.logic / total.logic : 0
      case 'creativity':
        return total.creativity
    }
  }

  let streakDays = 0
  // Today may not have started yet: a streak ending yesterday still counts.
  for (let i = activeDays.has(today) ? 0 : 1; activeDays.has(localDay(now - i * DAY)); i++) streakDays++

  const pillars = Object.fromEntries(PILLARS.map((p) => [p, { pillar: p, total: total[p], week: week[p], level: levelOf(p), detail: detailOf(p) }])) as Record<Pillar, PillarStat>
  const milestones: { id: MilestoneId; done: boolean }[] = [
    { id: 'firstWord', done: total.speech >= 1 },
    { id: 'tenWords', done: total.speech >= 10 },
    { id: 'firstTrace', done: total.motor >= 1 },
    { id: 'tenTraces', done: total.motor >= 10 },
    { id: 'firstSort', done: sorts >= 1 },
    { id: 'firstDrawing', done: total.creativity >= 1 },
    { id: 'fiveDrawings', done: total.creativity >= 5 },
    { id: 'streak3', done: streakDays >= 3 },
  ]
  return { pillars, days: dayKeys.map((day) => ({ day, counts: byDay.get(day) ?? zero() })), streakDays, milestones, wordsHeard }
}
