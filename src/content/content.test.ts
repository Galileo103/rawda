import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT, loadBundle } from '../../scripts/lib/contentFs'
import { dictionaries, rawDictionaries } from '../i18n'
import { clipKey } from '../services/audio/clipKey'
import { content } from './loader'
import { collectNarration } from './narration'
import { parseContent } from './parse'
import { picturePath } from './pictureSources'

describe('bundled content', () => {
  it('is valid through the app loader (Vite glob)', () => {
    expect(content.errors).toEqual([])
    expect(content.activities.length).toBeGreaterThanOrEqual(10)
    expect(content.stories.length).toBeGreaterThanOrEqual(1)
  })

  it('is valid through the build-time reader (fs)', () => {
    const { errors, bundle } = loadBundle()
    expect(errors).toEqual([])
    expect(bundle.activities.map((a) => a.id).sort()).toEqual(content.activities.map((a) => a.id).sort())
  })

  it('has a stable unique id for every activity and item', () => {
    const ids = content.activities.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of content.activities) {
      const itemIds = a.items.map((i) => i.id)
      expect(new Set(itemIds).size).toBe(itemIds.length)
    }
  })

  it('ships every illustration offline', () => {
    const hexes = new Set<string>([...content.lexicon.values()].map((e) => e.image))
    content.rewards.forEach((r) => hexes.add(r.hex))
    content.studio.stamps.forEach((h) => hexes.add(h))
    for (const hex of hexes) expect(existsSync(join(ROOT, 'public', 'assets', picturePath(hex))), hex).toBe(true)
    for (const p of content.studio.pages) expect(existsSync(join(ROOT, 'public', 'assets', 'coloring', p.file)), p.file).toBe(true)
  })

  it('MVP slice: Arabic letters, English phonics, counting, colours/shapes, logic and a bilingual story', () => {
    const ids = new Set(content.activities.map((a) => a.id))
    for (const id of ['ar-find-letter', 'en-letter-picture', 'count-objects', 'colors', 'shapes', 'memory']) expect(ids.has(id), id).toBe(true)
    const story = content.stories[0]!
    expect(story.pages.every((p) => p.text.ar && p.text.en)).toBe(true)
  })
})

describe('Discover lessons (educational correctness)', () => {
  const firstLetter = (w: string) => [...w.normalize('NFC')].find((c) => /[\p{L}]/u.test(c) && !/[ً-ْٰ]/.test(c)) ?? ''

  it('every example word really starts with the letter being taught', () => {
    for (const a of content.activities.filter((x) => x.template === 'lesson' && x.areaId === 'letters')) {
      const lang = a.langs === 'en' ? 'en' : 'ar'
      for (const item of a.items as { id: string; highlight?: string; examples: string[] }[]) {
        for (const id of item.examples) {
          const word = content.lexicon.get(id)![lang]
          if (item.id === 'x') {
            expect(word.toLowerCase(), `${a.id}/${item.id}`).toContain('x') // X: "fox" ends with it
            continue
          }
          const first = firstLetter(word)
          // أ / ا are the same letter (alif) for a child
          const norm = (c: string) => c.toLowerCase().replace(/[أإآ]/, 'ا')
          expect(norm(first), `${a.id}/${item.id}: ${word}`).toBe(norm(item.highlight ?? ''))
        }
      }
    }
  })

  it('cover the whole alphabet in order (28 Arabic, 26 English letters)', () => {
    const ar = content.activities.find((a) => a.id === 'ar-discover')!
    const en = content.activities.find((a) => a.id === 'en-discover')!
    expect(ar.items).toHaveLength(28)
    expect(en.items.map((i) => i.id).join('')).toBe('abcdefghijklmnopqrstuvwxyz')
  })
})

describe('content validation', () => {
  it('reports problems instead of throwing, and skips only the bad entry', () => {
    const lex = [{ id: 'cat', image: '1F408', ar: 'قِطَّة', en: 'cat' }]
    const good = { id: 'ok', areaId: 'logic', template: 'choice', langs: 'en', level: 1, title: { en: 'T' }, intro: { en: 'I' }, icon: { kind: 'lex', id: 'cat' }, items: [{ id: 'q', skill: 's', difficulty: 1, say: { en: 'Q?' }, answer: { kind: 'lex', id: 'cat' }, choices: [{ kind: 'lex', id: 'cat' }, { kind: 'glyph', text: 'A' }] }] }
    const missingLang = { ...good, id: 'bad-lang', langs: 'any' }
    const unknownLex = { ...good, id: 'bad-lex', icon: { kind: 'lex', id: 'unicorn' } }
    const r = parseContent({
      'content/lexicon.json': lex,
      'content/activities/a.json': good,
      'content/activities/b.json': missingLang,
      'content/activities/c.json': unknownLex,
      'content/activities/d.json': { nonsense: true },
    })
    expect(r.activities.map((a) => a.id)).toEqual(['ok'])
    expect(r.errors.join('\n')).toMatch(/missing "ar" text/)
    expect(r.errors.join('\n')).toMatch(/unknown lexicon id "unicorn"/)
    expect(r.errors.some((e) => e.startsWith('content/activities/d.json'))).toBe(true)
  })
})

describe('i18n', () => {
  const shape = (o: unknown): unknown =>
    Array.isArray(o) ? `array` : typeof o === 'object' && o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v)])) : typeof o

  it('Arabic and English dictionaries have the same keys', () => {
    expect(shape(dictionaries.ar)).toEqual(shape(dictionaries.en))
  })

  it('number words and digit words line up', () => {
    expect(dictionaries.ar.voice.numbers).toHaveLength(10)
    expect(dictionaries.en.voice.numbers).toHaveLength(10)
    expect(dictionaries.ar.digitWords).toHaveLength(10)
    expect(dictionaries.ar.map.levels).toHaveLength(5)
  })
})

describe('narration', () => {
  it('covers every instruction the app speaks, in each language it is needed', () => {
    const lines = collectNarration(content, rawDictionaries)
    const keys = new Set(lines.map((l) => clipKey(l.lang, l.text)))
    for (const a of content.activities) {
      const langs = a.langs === 'any' ? (['ar', 'en'] as const) : ([a.langs] as const)
      for (const lang of langs) for (const item of a.items) expect(keys.has(clipKey(lang, item.say[lang]!)), `${a.id}/${item.id}/${lang}`).toBe(true)
    }
    expect(keys.has(clipKey('ar', dictionaries.ar.voice.numbers[2]!))).toBe(true)
  })

  it('normalises braces and whitespace so story highlights map to the same clip', () => {
    expect(clipKey('ar', 'هَذِهِ {قِطَّةٌ}  صَغِيرَةٌ')).toBe(clipKey('ar', 'هَذِهِ قِطَّةٌ صَغِيرَةٌ'))
    expect(clipKey('ar', 'x')).not.toBe(clipKey('en', 'x'))
  })
})

describe('Discover first, then practise (every section)', () => {
  const mapAreas = content.areas.filter((a) => a.route === 'map').map((a) => a.id)
  const lessonsOf = (area: string) => content.activities.filter((a) => a.areaId === area && a.template === 'lesson')
  const practiceOf = (area: string) => content.activities.filter((a) => a.areaId === area && a.template !== 'lesson')

  it('every map section opens with a Discover lesson', () => {
    for (const area of mapAreas) {
      const lessons = lessonsOf(area)
      expect(lessons.length, area).toBeGreaterThan(0)
      const first = [...content.activities.filter((a) => a.areaId === area)].sort((a, b) => a.level - b.level || a.order - b.order)[0]
      expect(first?.template, `${area} starts with ${first?.id}`).toBe('lesson')
    }
  })

  it('everything a lesson teaches is practised somewhere in its section', () => {
    for (const area of mapAreas) {
      const practised = new Set(practiceOf(area).flatMap((a) => a.items.map((i) => i.skill)))
      for (const lesson of lessonsOf(area))
        for (const item of lesson.items) {
          const teaches = (item as { teaches: string[] }).teaches
          expect(teaches.some((s) => practised.has(s)), `${lesson.id}/${item.id} teaches ${teaches.join(',')}`).toBe(true)
        }
    }
  })

  it('practice in the newer sections narrows to what was discovered', () => {
    // Letters and numbers also have skills that build on lessons (forms, cases, adding…).
    for (const area of ['colors-shapes', 'islamic', 'science', 'logic']) {
      const taught = new Set(lessonsOf(area).flatMap((l) => l.items.flatMap((i) => (i as { teaches: string[] }).teaches)))
      for (const act of practiceOf(area)) {
        if (act.template === 'trace') continue // finger paths are motor warm-ups, not new concepts
        const covered = act.items.filter((i) => taught.has(i.skill)).length
        expect(covered, `${act.id}: ${covered}/${act.items.length} items taught`).toBe(act.items.length)
      }
    }
  })
})

describe('Discover boards', () => {
  it('show every lesson item with its own picture, so no two tiles look the same', () => {
    for (const act of content.activities) {
      if (act.template !== 'lesson') continue
      const seen = new Map<string, string>()
      for (const item of act.items) {
        const key = JSON.stringify((item as { focus: unknown }).focus)
        expect(seen.get(key), `${act.id}: "${item.id}" looks the same as "${seen.get(key)}"`).toBeUndefined()
        seen.set(key, item.id)
      }
    }
  })
})
