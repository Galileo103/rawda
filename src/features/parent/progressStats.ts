import type { Activity } from '../../content/schemas'
import { type MasteryRecord, isMastered, needsPractice } from '../../domain/engine/mastery'
import type { AreaId, Lang } from '../../domain/types'
import { type AttemptRow, type CompletionRow, localDay } from '../../services/db'

export interface Bucket {
  practiced: number
  mastered: number
  /** Average estimate 0..1 over practised concepts. */
  avg: number
}

/** What the child practised today, per learning area: distinct concepts (skill + language). */
export function practiceToday(attempts: readonly Pick<AttemptRow, 'ts' | 'areaId' | 'skill' | 'lang'>[], now = Date.now()): { area: AreaId; concepts: number }[] {
  const today = localDay(now)
  const areas = new Map<AreaId, Set<string>>()
  for (const a of attempts) {
    if (localDay(a.ts) !== today) continue
    const skills = areas.get(a.areaId) ?? new Set<string>()
    skills.add(`${a.skill}|${a.lang}`)
    areas.set(a.areaId, skills)
  }
  return [...areas].map(([area, skills]) => ({ area, concepts: skills.size })).sort((x, y) => y.concepts - x.concepts)
}

export interface ProgressStats {
  activitiesDone: number
  conceptsPracticed: number
  stars: number
  byArea: Map<AreaId, Bucket>
  byLang: Map<Lang, Bucket>
  /** Mastered concepts, most recent first. */
  recent: MasteryRecord[]
  /** Concepts practised lately (mastered or not), most recent first. */
  practisedLately: MasteryRecord[]
  practiceMore: MasteryRecord[]
}

/** Which area each skill belongs to (from content), so mastery records can be grouped. */
export function skillAreas(activities: readonly Activity[]): Map<string, AreaId> {
  const m = new Map<string, AreaId>()
  for (const a of activities) for (const i of a.items as { skill: string }[]) if (!m.has(i.skill)) m.set(i.skill, a.areaId)
  return m
}

/** Pure summary for the parent dashboard. Descriptive only — never a diagnosis. */
export function computeStats(completions: readonly CompletionRow[], mastery: readonly MasteryRecord[], areaOf: ReadonlyMap<string, AreaId>): ProgressStats {
  const byArea = new Map<AreaId, Bucket>()
  const byLang = new Map<Lang, Bucket>()
  const add = <K>(map: Map<K, Bucket>, key: K, r: MasteryRecord) => {
    const b = map.get(key) ?? { practiced: 0, mastered: 0, avg: 0 }
    b.avg = (b.avg * b.practiced + r.score) / (b.practiced + 1)
    b.practiced++
    if (isMastered(r)) b.mastered++
    map.set(key, b)
  }
  for (const r of mastery) {
    const area = areaOf.get(r.skillId) ?? (r.skillId.startsWith('story.') ? 'stories' : undefined)
    if (area) add(byArea, area, r)
    add(byLang, r.lang, r)
  }
  return {
    activitiesDone: completions.length,
    conceptsPracticed: mastery.length,
    stars: completions.reduce((s, c) => s + c.stars, 0),
    byArea,
    byLang,
    recent: mastery.filter(isMastered).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 10),
    practisedLately: [...mastery].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 10),
    practiceMore: mastery.filter(needsPractice).sort((a, b) => a.score - b.score).slice(0, 10),
  }
}
