import type { Lang } from '../domain/types'
import type { Dict } from '../i18n'
import { gameLines } from './games'
import type { ContentBundle } from './parse'
import type { LexEntry, Localized, Visual } from './schemas'

/**
 * What the app *says* for a visual. Pure (no Vite APIs) so the audio build script
 * generates exactly the clips the app will ask for.
 */
export function spokenTextFrom(v: Visual, lang: Lang, lexicon: ReadonlyMap<string, LexEntry>, d: Dict): string {
  switch (v.kind) {
    case 'lex':
      return lexicon.get(v.id)?.[lang] ?? ''
    case 'group':
      return numberWordFrom(v.count, d)
    case 'numeral':
      return numberWordFrom(v.value, d)
    case 'color':
      return d.colors[v.color]
    case 'shape':
      return d.shapes[v.shape]
    case 'phrase':
      return v.text[lang]
    case 'glyph':
    case 'img':
    case 'row':
      return ''
  }
}

export function numberWordFrom(n: number, d: Dict): string {
  return d.voice.numbers[n - 1] ?? String(n)
}

/** Every line the app can speak, per language — the input for scripts/render-audio.ts. */
export function collectNarration(bundle: ContentBundle, dicts: Record<Lang, Dict>): { lang: Lang; text: string }[] {
  const out = new Map<string, { lang: Lang; text: string }>()
  const add = (lang: Lang, text: string | undefined) => {
    const t = text?.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
    if (t) out.set(`${lang}\u0000${t}`, { lang, text: t })
  }
  const addLoc = (lang: Lang, t: Localized | undefined) => add(lang, t?.[lang])

  for (const lang of ['ar', 'en'] as const) {
    const d = dicts[lang]
    const v = d.voice
    for (const value of Object.values(v)) {
      if (typeof value === 'string') add(lang, value)
      else for (const line of value) add(lang, line)
    }
    for (const c of Object.values(d.colors)) add(lang, c)
    for (const s of Object.values(d.shapes)) add(lang, s)
    for (const e of bundle.lexicon.values()) add(lang, e[lang])
    for (const a of bundle.areas) add(lang, a.title[lang])
    for (const r of bundle.rewards) add(lang, r.name[lang])
    for (const b of bundle.breaks) add(lang, b.say[lang])
    for (const line of gameLines(lang, d)) add(lang, line)

    for (const a of bundle.activities) {
      if (a.langs !== 'any' && a.langs !== lang) continue
      addLoc(lang, a.intro)
      for (const item of a.items) {
        addLoc(lang, item.say)
        if (a.template === 'choice' && 'answer' in item) {
          const ci = item as { answer: Visual; sayAfter?: Localized }
          addLoc(lang, ci.sayAfter)
          add(lang, spokenTextFrom(ci.answer, lang, bundle.lexicon, d))
        }
        if (a.template === 'sequence' && 'steps' in item) for (const s of item.steps as Visual[]) add(lang, spokenTextFrom(s, lang, bundle.lexicon, d))
        if (a.template === 'sort' && 'things' in item) for (const th of item.things as { v: Visual }[]) add(lang, spokenTextFrom(th.v, lang, bundle.lexicon, d))
        if (a.template === 'speak' && 'word' in item) add(lang, bundle.lexicon.get(item.word as string)?.[lang])
        if (a.template === 'lesson' && 'meet' in item) {
          const li = item as { meet: Localized; check?: { say: Localized; answer: Visual } }
          addLoc(lang, li.meet)
          addLoc(lang, li.check?.say)
          if (li.check) add(lang, spokenTextFrom(li.check.answer, lang, bundle.lexicon, d))
        }
      }
    }

    for (const s of bundle.stories) {
      for (const p of s.pages) add(lang, p.text[lang])
      for (const q of s.questions) {
        addLoc(lang, q.say)
        addLoc(lang, q.sayAfter)
        add(lang, spokenTextFrom(q.answer, lang, bundle.lexicon, d))
      }
    }
  }
  return [...out.values()]
}
