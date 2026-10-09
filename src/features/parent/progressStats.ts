import type { Activity } from '../../content/schemas'
import { type MasteryRecord, isMastered, needsPractice } from '../../domain/engine/mastery'
import type { AreaId, Lang } from '../../domain/types'
import type { CompletionRow } from '../../services/db'

export interface Bucket {
  practiced: number
  mastered: number
  /** Average estimate 0..1 over practised concepts. */
  avg: number
}

export interface ProgressStats {
  activitiesDone: number
  conceptsPracticed: number
  stars: number
  byArea: Map<AreaId, Bucket>
  byLang: Map<Lang, Bucket>
  recent: MasteryRecord[]
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
    practiceMore: mastery.filter(needsPractice).sort((a, b) => a.score - b.score).slice(0, 10),
  }
}
