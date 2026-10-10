import type { MasteryRecord } from './engine/mastery'
import type { Lang } from './types'

/**
 * The Remember Box: once a day, a few things the child learned on earlier days come back
 * as quick one-tap cards, chosen by the spaced-review schedule (mastery `dueAt`) and
 * weakest first. Only kinds that fit a one-tap card: letters, numbers, colours, shapes.
 */

export const REMEMBER_ACTIVITY = 'remember'
/** Stars for opening the box (once a day, like the games' surprise seed). */
export const REMEMBER_STARS = 2
export const REMEMBER_CARDS = 3

export type ReviewCard =
  | { skill: string; kind: 'letter'; id: string }
  | { skill: string; kind: 'number'; n: number }
  | { skill: string; kind: 'color'; color: string }
  | { skill: string; kind: 'shape'; shape: string }

/** What a skill id looks like as a review card in this language (undefined if it can't be one). */
export function reviewCard(skill: string, lang: Lang): ReviewCard | undefined {
  const letter = new RegExp(`^${lang}\\.letter\\.(\\w+)$`).exec(skill)
  if (letter?.[1]) return { skill, kind: 'letter', id: letter[1] }
  const num = /^num\.count\.(\d+)$/.exec(skill)
  if (num?.[1]) return { skill, kind: 'number', n: Number(num[1]) }
  const color = /^color\.(\w+)$/.exec(skill)
  if (color?.[1]) return { skill, kind: 'color', color: color[1] }
  const shape = /^shape\.(\w+)$/.exec(skill)
  if (shape?.[1]) return { skill, kind: 'shape', shape: shape[1] }
  return undefined
}

/**
 * Up to three cards that are due today and were last seen before today (so it really is
 * remembering), only for skills the child discovered. Weakest first, then longest waiting.
 */
export function pickReview(records: readonly MasteryRecord[], introduced: ReadonlySet<string>, lang: Lang, now: number, max = REMEMBER_CARDS): { card: ReviewCard; record: MasteryRecord }[] {
  const dayStart = new Date(now).setHours(0, 0, 0, 0)
  return records
    .filter((r) => r.lang === lang && introduced.has(r.skillId) && r.dueAt <= now && r.lastSeen < dayStart)
    .map((record) => ({ record, card: reviewCard(record.skillId, lang) }))
    .filter((x): x is { record: MasteryRecord; card: ReviewCard } => !!x.card)
    .sort((a, b) => a.record.score - b.record.score || a.record.dueAt - b.record.dueAt)
    .slice(0, max)
}

/** Whole days since a timestamp ("learned 3 days ago"); at least 1. */
export function daysAgo(ts: number, now: number): number {
  const a = new Date(ts).setHours(0, 0, 0, 0)
  const b = new Date(now).setHours(0, 0, 0, 0)
  return Math.max(1, Math.round((b - a) / 86_400_000))
}
