import { type MasteryRecord, masteryKey } from './engine/mastery'
import type { Lang } from './types'

export interface RecommendableActivity {
  id: string
  level: number
  skills: string[]
  lang: Lang
}

/**
 * "Continue learning": the first activity (in curriculum order) not yet completed;
 * once everything has been done, the one whose skills are weakest.
 */
export function recommendNext<T extends RecommendableActivity>(
  activities: readonly T[],
  completed: ReadonlySet<string>,
  mastery: ReadonlyMap<string, MasteryRecord>,
  excludeId?: string,
): T | undefined {
  const candidates = activities.filter((a) => a.id !== excludeId)
  const pool = candidates.length > 0 ? candidates : activities
  const ordered = [...pool].sort((a, b) => a.level - b.level)
  const notDone = ordered.find((a) => !completed.has(a.id))
  if (notDone) return notDone
  let best: T | undefined
  let bestScore = Infinity
  for (const a of ordered) {
    const scores = a.skills.map((s) => mastery.get(masteryKey(s, a.lang))?.score ?? 0)
    const avg = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : 0
    if (avg < bestScore) {
      bestScore = avg
      best = a
    }
  }
  return best
}
