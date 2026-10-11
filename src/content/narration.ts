import { type Gender, HERO_WORD, resolveGender, splitName } from '../domain/child'
import type { Lang } from '../domain/types'
import type { Dict, RawDict } from '../i18n'
import { funGameLines } from './funGames'
import { gameLines } from './games'
import { writingLines } from './writing'
import type { ContentBundle } from './parse'
import { lessonCountLine, lessonExampleLine, lessonExamplesLine, lessonTraceLine } from './lessonLines'
import type { LessonItem, LexEntry, Localized, Visual } from './schemas'

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

const GENDERS: (Gender | undefined)[] = ['m', 'f', undefined]

/**
 * Every line the app can speak, per language — the input for scripts/render-audio.ts.
 * Gendered lines are collected in every form (boy, girl, not set), and lines with the
 * child's name as the pieces around it (the name slot is said as "our hero/heroine").
 */
export function collectNarration(bundle: ContentBundle, dicts: Record<Lang, RawDict>): { lang: Lang; text: string }[] {
  const out = new Map<string, { lang: Lang; text: string }>()
  const add = (lang: Lang, text: string | undefined) => {
    for (const piece of splitName(text ?? '')) {
      const t = piece?.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
      if (t) out.set(`${lang}\u0000${t}`, { lang, text: t })
    }
  }
  const addLoc = (lang: Lang, t: Localized | undefined) => add(lang, t?.[lang])

  for (const [lang, gender] of (['ar', 'en'] as const).flatMap((l) => GENDERS.map((g) => [l, g] as const))) {
    const d: Dict = resolveGender(dicts[lang], gender)
    for (const w of Object.values(HERO_WORD[lang])) add(lang, w)
    // Voice lines are strings, lists, or maps of lists (praiseBy, per template).
    const addLines = (value: unknown): void => {
      if (typeof value === 'string') add(lang, value)
      else if (Array.isArray(value)) for (const line of value) addLines(line)
      else if (value && typeof value === 'object') for (const inner of Object.values(value)) addLines(inner)
    }
    // Lesson step lines are templates ({focus}, {word}); they are expanded per lesson below.
    addLines({ ...d.voice, lesson: undefined })
    for (const c of Object.values(d.colors)) add(lang, c)
    for (const s of Object.values(d.shapes)) add(lang, s)
    for (const e of bundle.lexicon.values()) add(lang, e[lang])
    for (const a of bundle.areas) add(lang, a.title[lang])
    for (const r of bundle.rewards) add(lang, r.name[lang])
    for (const b of bundle.breaks) add(lang, b.say[lang])
    for (const line of gameLines(lang, d)) add(lang, line)
    for (const line of funGameLines(lang, d, bundle.lexicon, bundle.activities)) add(lang, line)
    for (const line of writingLines(lang, d)) add(lang, line)

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
        // Lines that speak to a boy or a girl ("give" items: أَعْطِنِي / أَعْطِينِي): every form.
        if ('ask' in item && item.ask) for (const gd of ['m', 'f'] as const) add(lang, resolveGender(item.ask[lang], gd))
        if (a.template === 'syllables' && 'parts' in item) for (const part of item.parts as string[]) add(lang, part)
        if (a.template === 'lesson' && 'meet' in item) {
          const li = item as { meet: Localized; calm?: { say: Localized }; check?: { say: Localized; answer: Visual } }
          addLoc(lang, li.meet)
          addLoc(lang, li.calm?.say)
          addLoc(lang, li.check?.say)
          if (li.check) add(lang, spokenTextFrom(li.check.answer, lang, bundle.lexicon, d))
          const lesson = item as LessonItem
          add(lang, lessonExamplesLine(lesson, lang, d, (id) => bundle.lexicon.get(id)?.[lang]))
          for (const id of lesson.examples) {
            const word = bundle.lexicon.get(id)?.[lang]
            if (word) add(lang, lessonExampleLine(lesson, word, lang, d))
          }
          if (lesson.trace) add(lang, lessonTraceLine(lesson, lang, d))
          if (lesson.count) add(lang, lessonCountLine(lesson.count.n, d))
        }
      }
    }

    for (const s of bundle.stories.map((st) => resolveGender(st, gender))) {
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
