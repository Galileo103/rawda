/**
 * npm run audio:sample [voice ...] — renders a few typical narration lines with several
 * Arabic neural voices into .audio-cache/samples/<voice>/ so a grown-up can listen and
 * choose. Set RAWDA_AR_VOICE to the winner, then run `npm run audio:render`.
 *
 * All candidates read Modern Standard Arabic (الفصحى) from the fully vowelled text; they
 * differ in timbre and in regional colouring of a few sounds (for example ج).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { dictionaries } from '../src/i18n'
import { ROOT } from './lib/contentFs'
import { CHILD_RATE, DEFAULT_AR_VOICE, finalize, synthesize } from './render-audio'

const CANDIDATES = [
  DEFAULT_AR_VOICE,
  'ar-EG-ShakirNeural',
  'ar-SA-ZariyahNeural',
  'ar-SA-HamedNeural',
  'ar-JO-SanaNeural',
  'ar-AE-FatimaNeural',
  'ar-SY-AmanyNeural',
  'ar-QA-AmalNeural',
]

const LINES = [
  { key: '01-welcome', text: dictionaries.ar.voice.welcome },
  { key: '02-letter', text: 'أَيُّ صُورَةٍ تَبْدَأُ بِحَرْفِ الْجِيمِ؟' },
  { key: '03-words', text: 'جَمَل. أَرْنَب. قِطَّة. ثَعْلَب. ضِفْدَع.' },
  { key: '04-numbers', text: dictionaries.ar.voice.numbers.join('. ') + '.' },
  { key: '05-praise', text: dictionaries.ar.voice.praise.join(' ') },
]

const voices = process.argv.slice(2).length ? process.argv.slice(2) : CANDIDATES
const outRoot = join(ROOT, '.audio-cache', 'samples')
for (const voice of voices) {
  const dir = join(outRoot, voice)
  mkdirSync(dir, { recursive: true })
  console.log(`${voice}:`)
  const rendered = synthesize({ engine: 'neural', voice, rate: CHILD_RATE }, LINES, join(dir, 'raw'))
  for (const [key, file] of rendered) finalize(file, join(dir, `${key}.mp3`))
  if (rendered.size < LINES.length) console.error(`  ${LINES.length - rendered.size} line(s) failed`)
}
console.log(`\nListen in ${outRoot}, then: RAWDA_AR_VOICE=<voice> npm run audio:render`)
