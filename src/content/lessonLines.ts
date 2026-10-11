import type { Lang } from '../domain/types'
import type { Dict } from '../i18n'
import { AR_LETTERS } from './games'
import type { LessonItem } from './schemas'

/**
 * What each Discover lesson step says (and shows as the caption a grown-up reads aloud
 * when the voice is off). Pure, so the audio build renders exactly these lines.
 */

const LETTER_SKILL = /^(ar|en)\.letter\.([a-z]+)$/
const MARKS = /[ً-ْٰـ]/g

const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m)

type LessonLike = Pick<LessonItem, 'skill' | 'meet' | 'highlight' | 'trace' | 'focus'>

/**
 * The letter a letter lesson teaches, as the lines name it: "الْبَاءِ" (fully vowelled, from the
 * lesson's own meet line "هَذَا حَرْفُ الْبَاءِ…") or "B". Undefined for non-letter lessons.
 */
export function lessonLetterName(item: LessonLike, lang: Lang): string | undefined {
  const skill = LETTER_SKILL.exec(item.skill)
  if (!skill) return undefined
  const meet = item.meet[lang] ?? ''
  if (lang === 'ar') {
    const m = /حَرْفُ\s+([^\s.،؛:!؟]+)/.exec(meet)
    return m?.[1] ?? AR_LETTERS.find((l) => l.id === skill[2])?.name
  }
  const m = /the letter ([A-Za-z])\b/i.exec(meet)
  return (m?.[1] ?? item.trace ?? (item.focus.kind === 'glyph' ? item.focus.text : ''))?.toUpperCase() || undefined
}

function startsWithLetter(word: string, letter: string | undefined): boolean {
  const first = [...word.replace(MARKS, '')][0]
  return !!letter && !!first && first.toLowerCase() === letter.toLowerCase()
}

/**
 * The examples step, all words on screen at once. A lesson with a single picture gets that
 * picture's own line (`wordOf` looks the word up in the lexicon), never a plural "these words".
 */
export function lessonExamplesLine(item: LessonLike & Pick<LessonItem, 'examples'>, lang: Lang, d: Dict, wordOf?: (id: string) => string | undefined): string {
  const only = item.examples.length === 1 ? wordOf?.(item.examples[0]!) : undefined
  if (only) return lessonExampleLine(item, only, lang, d)
  const focus = lessonLetterName(item, lang)
  return focus ? fill(d.voice.lesson.examplesAll, { focus }) : d.voice.lesson.look
}

/** The examples step, one word in focus (`word` as written in the lexicon). */
export function lessonExampleLine(item: LessonLike, word: string, lang: Lang, d: Dict): string {
  const focus = lessonLetterName(item, lang)
  if (!focus) return fill(d.voice.lesson.lookAt, { word })
  const line = startsWithLetter(word, item.highlight) ? d.voice.lesson.examples : d.voice.lesson.examplesIn
  return fill(line, { focus, word })
}

/** The tracing step; undefined when the lesson has no letter to name. */
export function lessonTraceLine(item: LessonLike, lang: Lang, d: Dict): string | undefined {
  const focus = lessonLetterName(item, lang)
  return focus ? fill(d.voice.lesson.trace, { focus }) : undefined
}

/** The counting step: "let's count together up to five!" (just "let's count together" for one). */
export function lessonCountLine(n: number, d: Dict): string {
  if (n <= 1) return d.voice.lesson.countOne
  return fill(d.voice.lesson.count, { n: d.voice.lesson.countTo[n - 1] ?? String(n) })
}
