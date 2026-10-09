import type { ItemOutcome, Lang } from '../types'

/**
 * Per-skill, per-language mastery. Arabic and English are tracked separately:
 * the key is `${skillId}|${lang}`.
 *
 * - `score` is a moving average of outcomes in [0, 1].
 * - `box` is a Leitner box (1..5) that only controls *when* to revisit.
 * Nothing decays with time: missing days never lowers anything.
 */
export interface MasteryRecord {
  key: string
  skillId: string
  lang: Lang
  score: number
  box: number
  attempts: number
  firstTryCorrect: number
  lastSeen: number
  dueAt: number
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

/** Review interval per box. Box 1 = revisit later in the same session. */
export const BOX_INTERVALS: Record<number, number> = {
  1: 0,
  2: 1 * DAY,
  3: 3 * DAY,
  4: 7 * DAY,
  5: 14 * DAY,
}

const ALPHA_UP = 0.35
const ALPHA_DOWN = 0.2 // mistakes move the estimate gently

export const MASTERED_SCORE = 0.8

export function masteryKey(skillId: string, lang: Lang): string {
  return `${skillId}|${lang}`
}

/** 1 for first-try, partial credit when solved with a little help. */
export function outcomeValue(o: ItemOutcome): number {
  if (o.firstTry) return 1
  if (o.misses + o.hintsUsed <= 1) return 0.5
  return 0.25
}

export function applyOutcome(
  prev: MasteryRecord | undefined,
  skillId: string,
  lang: Lang,
  outcome: ItemOutcome,
  now: number,
): MasteryRecord {
  const base: MasteryRecord = prev ?? {
    key: masteryKey(skillId, lang),
    skillId,
    lang,
    score: 0,
    box: 1,
    attempts: 0,
    firstTryCorrect: 0,
    lastSeen: now,
    dueAt: now,
  }
  const value = outcomeValue(outcome)
  const alpha = value >= base.score ? ALPHA_UP : ALPHA_DOWN
  const score = clamp01(base.score + alpha * (value - base.score))
  const box = outcome.firstTry ? Math.min(5, base.box + 1) : Math.max(1, base.box - 1)
  return {
    ...base,
    score,
    box,
    attempts: base.attempts + 1,
    firstTryCorrect: base.firstTryCorrect + (outcome.firstTry ? 1 : 0),
    lastSeen: now,
    dueAt: now + (BOX_INTERVALS[box] ?? 0),
  }
}

export function isMastered(r: MasteryRecord | undefined): boolean {
  return !!r && r.attempts >= 3 && r.score >= MASTERED_SCORE
}

/** "Worth practising together" — never shown to the child. */
export function needsPractice(r: MasteryRecord | undefined): boolean {
  return !!r && r.attempts >= 2 && r.score < 0.5
}

export function isDue(r: MasteryRecord | undefined, now: number): boolean {
  return !!r && r.dueAt <= now
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
