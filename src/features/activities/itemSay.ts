import { pick } from '../../content/loader'
import type { AnyItem } from '../../content/schemas'
import { type Gender, resolveGender } from '../../domain/child'
import type { Lang } from '../../domain/types'

/**
 * The instruction for a task. Items may add `ask`, a line that speaks to a boy or a girl
 * ({ m, f }, e.g. أَعْطِنِي / أَعْطِينِي); until the parent has said which, the neutral `say` is used.
 */
export function itemSay(item: AnyItem, lang: Lang, gender: Gender | undefined): string {
  const ask = 'ask' in item ? item.ask?.[lang] : undefined
  if (ask && (gender || typeof ask === 'string')) return resolveGender(ask, gender)
  return pick(item.say, lang)
}
