import { confusablesFor } from '../../content/confusables'
import { visualKey } from '../../content/parse'
import type { ChoiceItem, Visual } from '../../content/schemas'
import { choiceCountFor } from '../../domain/engine/difficulty'
import { type Rng, shuffle } from '../../domain/rng'
import type { Lang } from '../../domain/types'

/** How many options to show and whether look-alike letters should be the wrong ones. */
export interface ChoiceOptions {
  /** Most answer options shown at once (default 4). */
  maxChoices?: number
  /** Older children: pick wrong letters that look like the answer (ب/ت, b/d) before any other. */
  preferConfusables?: boolean
  /** Needed with `preferConfusables`: which alphabet's look-alikes to use. */
  lang?: Lang
}

/** Does `v` look like the glyph `answer` (both letters, and listed as twins)? */
export function isConfusable(v: Visual, answer: Visual, lang: Lang | undefined): boolean {
  if (!lang || v.kind !== 'glyph' || answer.kind !== 'glyph') return false
  return confusablesFor(answer.text, lang).includes(v.text)
}

/** Look-alikes of the answer first, then everything else; the order inside each part is kept. */
export function confusablesFirst<T extends Visual>(candidates: readonly T[], answer: Visual, lang: Lang | undefined): T[] {
  const alike = candidates.filter((v) => isConfusable(v, answer, lang))
  const rest = candidates.filter((v) => !isConfusable(v, answer, lang))
  return [...alike, ...rest]
}

/**
 * Options for a choice task: explicit `choices`, or the answer plus distractors drawn
 * from the activity's other answers. More options as difficulty rises (2 → 3 → 4).
 * With `preferConfusables`, wrong letters are the ones that look like the answer first,
 * so the task is really about telling ب from ت rather than ب from a random letter.
 * A plain number is still accepted as `maxChoices` for older callers.
 */
export function buildChoices(item: ChoiceItem, pool: readonly Visual[], rng: Rng, options: number | ChoiceOptions = 4): Visual[] {
  const { maxChoices = 4, preferConfusables = false, lang } = typeof options === 'number' ? { maxChoices: options } : options
  const answerKey = visualKey(item.answer)
  const order = (vs: readonly Visual[]) => (preferConfusables ? confusablesFirst(shuffle(vs, rng), item.answer, lang) : shuffle(vs, rng))
  if (item.choices) {
    // Younger children see fewer options: keep the answer, trim extra distractors.
    const others = order(item.choices.filter((c) => visualKey(c) !== answerKey)).slice(0, Math.max(1, maxChoices - 1))
    return shuffle([item.answer, ...others], rng)
  }
  const n = Math.min(choiceCountFor(item.difficulty), maxChoices)
  const seen = new Set([answerKey])
  const distractors: Visual[] = []
  for (const v of order(pool)) {
    const k = visualKey(v)
    if (seen.has(k)) continue
    seen.add(k)
    distractors.push(v)
    if (distractors.length >= n - 1) break
  }
  return shuffle([item.answer, ...distractors], rng)
}

/** Numeral options near the answer (counting): close numbers make the task about counting, not guessing. */
export function numberChoices(answer: number, difficulty: number, rng: Rng, max = 10, maxChoices = 4): number[] {
  const n = Math.min(choiceCountFor(difficulty), maxChoices)
  const near: number[] = []
  for (let d = 1; near.length < n - 1 && d <= max; d++) {
    const opts = shuffle([answer - d, answer + d], rng).filter((x) => x >= 1 && x <= max)
    for (const o of opts) if (near.length < n - 1) near.push(o)
  }
  return shuffle([answer, ...near], rng)
}

/** Which wrong options to hide at hint level ≥ 2, keeping the answer and one untried distractor. */
export function optionsToHide(keys: readonly string[], answerKey: string, tried: ReadonlySet<string>, hintLevel: number): Set<string> {
  if (hintLevel < 2) return new Set()
  const keepWrong = keys.find((k) => k !== answerKey && !tried.has(k))
  return new Set(keys.filter((k) => k !== answerKey && k !== keepWrong))
}
