import type { AreaId, Lang } from '../domain/types'
import { fmt } from '../i18n'
import type { Dict } from '../i18n'
import { AR_LETTERS } from './games'

/**
 * The Writing room's catalog: every letter, letter form and digit a child can colour in.
 * Pure (no Vite APIs) so scripts/render-audio.ts can pre-render every line Hala says here.
 */

export const WRITE_SETS = ['ar', 'arForms', 'en', 'num'] as const
export type WriteSet = (typeof WRITE_SETS)[number]
export type FormPos = 'start' | 'middle' | 'end'

export interface WriteEntry {
  /** Unique across sets: "ar-ba", "arf-ba-start", "en-A", "en-a", "num-ar-3". */
  id: string
  set: WriteSet
  /** What is drawn (letter forms carry a tatweel: "بـ", "ـبـ", "ـب"). */
  glyph: string
  /** Language the entry is spoken in, and stored under. */
  lang: Lang
  skill: string
  areaId: AreaId
  /** Arabic letter id ("ba") for letters and their forms; the letter or digit otherwise. */
  key: string
  pos?: FormPos
}

/** Activity id that writing results are stored under (attempts table). */
export const WRITE_FILL_ACTIVITY = 'write:fill'

const TATWEEL = 'ـ'
/** Letters that never join to the next one: only a standalone and an end form. */
const NON_JOINING = new Set(['alif', 'dal', 'dhal', 'ra', 'zay', 'waw'])
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Alif is written with its hamza (أ), as children learn it at school. */
const arGlyph = (glyph: string) => (glyph === 'ا' ? 'أ' : glyph)

function build(): WriteEntry[] {
  const out: WriteEntry[] = []
  for (const l of AR_LETTERS) {
    out.push({ id: `ar-${l.id}`, set: 'ar', glyph: arGlyph(l.glyph), lang: 'ar', skill: `ar.write.${l.id}`, areaId: 'letters', key: l.id })
  }
  for (const l of AR_LETTERS) {
    const forms: [FormPos, string][] = NON_JOINING.has(l.id)
      ? [['end', TATWEEL + l.glyph]]
      : [
          ['start', l.glyph + TATWEEL],
          ['middle', TATWEEL + l.glyph + TATWEEL],
          ['end', TATWEEL + l.glyph],
        ]
    for (const [pos, glyph] of forms) {
      out.push({ id: `arf-${l.id}-${pos}`, set: 'arForms', glyph, lang: 'ar', skill: `ar.write.${l.id}.${pos}`, areaId: 'letters', key: l.id, pos })
    }
  }
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const s = c.toLowerCase()
    out.push({ id: `en-${c}`, set: 'en', glyph: c, lang: 'en', skill: `en.write.cap-${s}`, areaId: 'letters', key: c })
    out.push({ id: `en-${s}`, set: 'en', glyph: s, lang: 'en', skill: `en.write.${s}`, areaId: 'letters', key: s })
  }
  for (let n = 0; n <= 9; n++) {
    out.push({ id: `num-ar-${n}`, set: 'num', glyph: AR_DIGITS[n] as string, lang: 'ar', skill: `ar.write.num-${n}`, areaId: 'numbers', key: String(n) })
    out.push({ id: `num-en-${n}`, set: 'num', glyph: String(n), lang: 'en', skill: `en.write.num-${n}`, areaId: 'numbers', key: String(n) })
  }
  return out
}

export const WRITE_ENTRIES: readonly WriteEntry[] = build()
export const writeEntryById = (id: string | undefined) => WRITE_ENTRIES.find((e) => e.id === id)

/** The sets a child sees: Arabic ones when learning Arabic, English when learning English; numbers always. */
export function visibleSets(langs: readonly Lang[]): WriteSet[] {
  return WRITE_SETS.filter((s) => (s === 'ar' || s === 'arForms' ? langs.includes('ar') : s === 'en' ? langs.includes('en') : true))
}

/** Entries of one set, in order; digits only in the learning languages. */
export function entriesOf(set: WriteSet, langs: readonly Lang[]): WriteEntry[] {
  return WRITE_ENTRIES.filter((e) => e.set === set && (set !== 'num' || langs.includes(e.lang)))
}

/** What Hala says to start: "Let's colour the letter ba!", "…at the start of a word", "…the number three". */
export function fillLine(e: WriteEntry, d: Dict): string {
  const w = d.writing.say
  if (e.set === 'num') return fmt(w.fillNumber, { n: digitWord(Number(e.key), d) })
  if (e.lang === 'en') return fmt(e.glyph === e.glyph.toUpperCase() ? w.fillCapital : w.fillSmall, { letter: e.glyph })
  const name = AR_LETTERS.find((l) => l.id === e.key)?.name ?? e.glyph
  return fmt(e.pos ? w.fillForm[e.pos] : w.fillLetter, { letter: name })
}

export function digitWord(n: number, d: Dict): string {
  return n === 0 ? d.writing.say.zero : (d.voice.numbers[n - 1] ?? String(n))
}

/** Every line the Writing room can say in `lang` (for pre-rendering the audio). */
export function writingLines(lang: Lang, d: Dict): string[] {
  const w = d.writing.say
  const out = [w.hello, w.inside, w.almost, w.done, w.doneNumber]
  for (const e of WRITE_ENTRIES) if (e.lang === lang) out.push(fillLine(e, d))
  return out
}
