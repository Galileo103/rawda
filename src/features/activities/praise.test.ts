import { describe, expect, it } from 'vitest'
import type { TemplateId } from '../../content/schemas'
import { dict } from '../../i18n'
import { praiseLine } from './praise'

const TEMPLATES: TemplateId[] = ['choice', 'count', 'match', 'memory', 'sequence', 'sort', 'trace', 'speak', 'lesson', 'syllables']

describe('praiseLine', () => {
  it('names what the child did on odd answers and cheers on even ones', () => {
    for (const lang of ['ar', 'en'] as const) {
      const v = dict(lang, 'f').voice
      for (const template of TEMPLATES) {
        expect(v.praiseBy[template]).toContain(praiseLine(template, 1, v))
        expect(v.praise).toContain(praiseLine(template, 2, v))
        expect(v.praiseBy[template]).toContain(praiseLine(template, 3, v))
      }
    }
  })

  it('speaks to a boy, a girl, and "we" when the gender is not set', () => {
    const first = (g: 'm' | 'f' | undefined) => praiseLine('count', 1, dict('ar', g).voice, () => 0)
    expect(first('m')).toBe('عَدَدْتَ وَاحِدَةً وَاحِدَةً!')
    expect(first('f')).toBe('عَدَدْتِ وَاحِدَةً وَاحِدَةً!')
    expect(first(undefined)).toBe('عَدَدْنَا وَاحِدَةً وَاحِدَةً!')
  })

  it('every template has two or three short lines in both languages', () => {
    for (const lang of ['ar', 'en'] as const) {
      const v = dict(lang).voice
      for (const template of TEMPLATES) {
        expect(v.praiseBy[template].length, `${lang}/${template}`).toBeGreaterThanOrEqual(2)
        expect(v.praiseBy[template].length, `${lang}/${template}`).toBeLessThanOrEqual(3)
      }
    }
  })
})
