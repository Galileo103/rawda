import { type Rng, defaultRng, shuffle } from '../rng'
import type { Lang } from '../types'
import { type MasteryRecord, isDue, masteryKey, needsPractice } from './mastery'

export interface SchedulableItem {
  id: string
  skill: string
  difficulty: number
}

export interface ScheduleOptions {
  lang: Lang
  level: number
  mastery: ReadonlyMap<string, MasteryRecord>
  now: number
  count: number
  rng?: Rng
  /**
   * Skills the child has already been taught in a Discover lesson. When at least two
   * items match, practice draws only from them: we practise what was introduced.
   */
  focusSkills?: ReadonlySet<string>
}

/** Target mix: mostly review/weak items, some familiar wins, a few new ones. */
const REVIEW_SHARE = 0.6
const FAMILIAR_SHARE = 0.25

/**
 * Build a short session (count items) from an activity's item bank.
 * Deterministic for a given rng. Never places the same item twice in a row.
 */
export function pickSessionItems<T extends SchedulableItem>(items: readonly T[], opts: ScheduleOptions): T[] {
  const rng = opts.rng ?? defaultRng
  if (items.length === 0 || opts.count <= 0) return []

  const minDifficulty = Math.min(...items.map((i) => i.difficulty))
  const ceiling = Math.max(opts.level, minDifficulty)
  const focused = opts.focusSkills ? items.filter((i) => opts.focusSkills!.has(i.skill)) : []
  const useFocus = focused.length >= 2
  const eligible = useFocus ? focused : items.filter((i) => i.difficulty <= ceiling)
  const stretch = useFocus ? [] : items.filter((i) => i.difficulty === ceiling + 1)

  const rec = (i: T) => opts.mastery.get(masteryKey(i.skill, opts.lang))
  const review: T[] = []
  const familiar: T[] = []
  const fresh: T[] = []
  for (const item of eligible) {
    const r = rec(item)
    if (!r) fresh.push(item)
    else if (needsPractice(r) || isDue(r, opts.now)) review.push(item)
    else familiar.push(item)
  }

  // Weakest first among review; easiest first among new.
  const reviewQ = shuffle(review, rng).sort((a, b) => (rec(a)?.score ?? 0) - (rec(b)?.score ?? 0))
  const freshQ = shuffle(fresh, rng).sort((a, b) => a.difficulty - b.difficulty)
  const familiarQ = shuffle(familiar, rng)
  const stretchQ = shuffle(stretch, rng)

  const reviewN = Math.round(opts.count * REVIEW_SHARE)
  const familiarN = Math.round(opts.count * FAMILIAR_SHARE)
  const picked: T[] = []
  const take = (q: T[], n: number) => {
    while (n-- > 0 && q.length > 0 && picked.length < opts.count) picked.push(q.shift() as T)
  }
  take(reviewQ, reviewN)
  take(familiarQ, familiarN)
  take(freshQ, opts.count - picked.length)
  // Fill from whatever is left; stretch items only when the level is exhausted.
  for (const q of [freshQ, reviewQ, familiarQ, stretchQ]) take(q, opts.count - picked.length)

  // Small banks: repeat items (in a new order) rather than end early.
  const bank = picked.length > 0 ? [...picked] : [...eligible]
  while (picked.length < opts.count && bank.length > 0) picked.push(...shuffle(bank, rng).slice(0, opts.count - picked.length))

  return arrange(picked, rec, rng)
}

/**
 * Discover lessons follow the curriculum order: the next lesson not yet taken.
 * When all were taken, start again from the beginning (re-meeting a letter is fine).
 */
export function pickLessonItems<T extends { id: string }>(items: readonly T[], taken: ReadonlySet<string>, count: number): T[] {
  const fresh = items.filter((i) => !taken.has(i.id))
  return (fresh.length > 0 ? fresh : items).slice(0, Math.max(1, count))
}

/** Start with the most familiar item (an early win), shuffle the rest, avoid back-to-back repeats. */
function arrange<T extends SchedulableItem>(list: T[], rec: (i: T) => MasteryRecord | undefined, rng: Rng): T[] {
  if (list.length <= 1) return list
  let startIdx = 0
  list.forEach((item, idx) => {
    const best = list[startIdx] as T
    const s = rec(item)?.score ?? -1
    const bs = rec(best)?.score ?? -1
    if (s > bs || (s === bs && item.difficulty < best.difficulty)) startIdx = idx
  })
  const first = list[startIdx] as T
  const rest = shuffle(list.filter((_, i) => i !== startIdx), rng)
  const out = [first, ...rest]
  for (let i = 1; i < out.length; i++) {
    if ((out[i] as T).id === (out[i - 1] as T).id) {
      const swap = out.findIndex((x, j) => j > i && x.id !== (out[i] as T).id && (out[j - 1] as T).id !== (out[i] as T).id)
      if (swap > 0) [out[i], out[swap]] = [out[swap] as T, out[i] as T]
    }
  }
  return out
}
