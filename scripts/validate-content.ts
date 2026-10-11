/**
 * npm run validate:content — schema + cross-reference check for everything in /content.
 * Runs before every build; exits non-zero on any problem.
 */
import type { Lang } from '../src/domain/types'
import { loadBundle } from './lib/contentFs'

const { bundle, errors } = loadBundle()

/** Letter-lesson examples: each word must contain the lesson's letter, and no two may share a picture. */
const plain = (s: string) => s.normalize('NFC').replace(/[ً-ٰٟـ]/g, '').toLowerCase()
for (const a of bundle.activities) {
  if (a.template !== 'lesson') continue
  const langs: Lang[] = a.langs === 'any' ? ['ar', 'en'] : [a.langs]
  for (const item of a.items) {
    const where = `${a.id}/${item.id}`
    const seen = new Map<string, string>()
    for (const id of item.examples) {
      const word = bundle.lexicon.get(id)
      if (!word) continue // unknown ids are already reported by the parser
      if (item.highlight) {
        // A letter may list several forms (alif: ["أ", "إ"]); each word needs one of them.
        const forms = typeof item.highlight === 'string' ? [item.highlight] : item.highlight
        for (const lang of langs) {
          if (!forms.some((f) => plain(word[lang]).includes(plain(f))))
            errors.push(`${where}: example "${id}" (${word[lang]}) does not contain the lesson letter "${forms.join(' / ')}"`)
        }
      }
      const other = seen.get(word.image)
      if (other) errors.push(`${where}: examples "${other}" and "${id}" use the same picture ${word.image}`)
      else seen.set(word.image, id)
    }
  }
}

/**
 * Syllable clapping: the parts, joined, must spell the word in that language (tashkeel and spaces
 * ignored). A doubled letter (shadda) is split across two parts, so بَطَّة = بَطْ + طَة.
 */
const spelled = (s: string) =>
  s
    .normalize('NFC')
    .replace(/[ً-ِْ-ٰٟـ]/g, '') // every mark except shadda (U+0651)
    .replace(/(.)ّ/g, '$1$1')
    .replace(/[\s'’-]/g, '')
    .toLowerCase()
for (const a of bundle.activities) {
  if (a.template !== 'syllables') continue
  const langs: Lang[] = a.langs === 'any' ? ['ar', 'en'] : [a.langs]
  for (const item of a.items) {
    const word = bundle.lexicon.get(item.word)
    if (!word) continue
    for (const lang of langs) {
      if (spelled(item.parts.join('')) !== spelled(word[lang]))
        errors.push(`${a.id}/${item.id}: parts "${item.parts.join(' | ')}" do not spell "${word[lang]}" (${lang})`)
    }
  }
}

/** Letter stories: one story per lesson item (the lesson's end offers exactly one). Links are checked by the parser. */
const letterLinks = new Map<string, string>()
for (const st of bundle.stories) {
  if (!st.letter) continue
  const key = `${st.letter.activityId}/${st.letter.itemId}`
  const other = letterLinks.get(key)
  if (other) errors.push(`stories ${other} and ${st.id} are both linked to the letter ${key}`)
  else letterLinks.set(key, st.id)
}

const items = bundle.activities.reduce((n, a) => n + a.items.length, 0)
console.log(
  `content: ${bundle.areas.length} areas, ${bundle.activities.length} activities (${items} items), ` +
    `${bundle.stories.length} stories, ${bundle.lexicon.size} words, ${bundle.rewards.length} rewards, ` +
    `${bundle.studio.pages.length} coloring pages, ` +
    `${bundle.quran ? `Quran: ${bundle.quran.surahs.length} surahs` : 'no Quran data'}`,
)

if (errors.length > 0) {
  console.error(`\n✖ ${errors.length} content problem(s):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('✔ content is valid')
