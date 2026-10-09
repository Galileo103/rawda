/**
 * npm run validate:content — schema + cross-reference check for everything in /content.
 * Runs before every build; exits non-zero on any problem.
 */
import { loadBundle } from './lib/contentFs'

const { bundle, errors } = loadBundle()

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
