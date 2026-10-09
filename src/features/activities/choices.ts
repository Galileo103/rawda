import { visualKey } from '../../content/parse'
import type { ChoiceItem, Visual } from '../../content/schemas'
import { choiceCountFor } from '../../domain/engine/difficulty'
import { type Rng, shuffle } from '../../domain/rng'

/**
 * Options for a choice task: explicit `choices`, or the answer plus distractors drawn
 * from the activity's other answers. More options as difficulty rises (2 → 3 → 4).
 */
export function buildChoices(item: ChoiceItem, pool: readonly Visual[], rng: Rng, maxChoices = 4): Visual[] {
  if (item.choices) {
    // Younger children see fewer options: keep the answer, trim extra distractors.
    const answerKey = visualKey(item.answer)
    const others = shuffle(item.choices.filter((c) => visualKey(c) !== answerKey), rng).slice(0, Math.max(1, maxChoices - 1))
    return shuffle([item.answer, ...others], rng)
  }
  const n = Math.min(choiceCountFor(item.difficulty), maxChoices)
  const answerKey = visualKey(item.answer)
  const seen = new Set([answerKey])
  const distractors: Visual[] = []
  for (const v of shuffle(pool, rng)) {
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
