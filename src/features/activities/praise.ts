import type { TemplateId } from '../../content/schemas'
import { defaultRng, pickOne, type Rng } from '../../domain/rng'
import type { Dict } from '../../i18n'

/**
 * Hala's praise after the child's `nth` correct answer (1-based) in a session.
 * Odd answers name what the child just did ("you counted one by one"), which young
 * children take in as a strategy to reuse; even answers keep the familiar cheers so
 * praise never turns into a lecture. The streak line is chosen by the caller.
 */
export function praiseLine(template: TemplateId, nth: number, v: Dict['voice'], rng: Rng = defaultRng): string {
  const pool = nth % 2 === 1 ? v.praiseBy[template] : v.praise
  return pool.length ? pickOne(pool, rng) : ''
}
