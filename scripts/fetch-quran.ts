/**
 * npm run quran:fetch — the ONLY way Quranic material enters this project.
 *
 * Text:  Tanzil Quran Text (Uthmani, Hafs), verbatim — https://tanzil.net (CC BY 3.0, no changes allowed)
 * Names: Tanzil quran-data.js metadata
 * Audio: per-ayah teaching recitations from https://everyayah.com — Mahmoud Khalil Al-Husary (Mu'allim, the default)
 *        and Mohamed Siddiq Al-Minshawi (Mu'allim, with children repeating after him)
 *
 * Verification (the script aborts on any mismatch; nothing is written):
 *  - ayah count per surah == Tanzil metadata == quran.com chapter metadata
 *  - word count per ayah == quran.com word-by-word data (independent source)
 *  - the basmala heading is split from ayah 1 only if it is byte-identical to 1:1 of the same file
 *  - SHA-256 of the full text file and of every audio file is recorded
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { QuranZ } from '../src/content/schemas'
import { ROOT } from './lib/contentFs'

/** Al-Fatiha, then the last surahs in the order children usually learn them. */
const SURAHS = [1, 114, 113, 112, 111, 110]
const TEXT_URL = 'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=txt-2&agree=true'
const META_URL = 'https://tanzil.net/res/text/metadata/quran-data.js'
const QURANCOM = 'https://api.quran.com/api/v4'

/** Verified human recitations, per ayah. The first is the default (stored as each ayah's `audio`). */
const RECITERS = [
  { id: 'husary-muallim', folder: 'Husary_Muallim_128kbps', name: { ar: 'محمود خليل الحصري (المصحف المعلّم)', en: "Mahmoud Khalil Al-Husary (Mu'allim)" } },
  { id: 'minshawy-muallim', folder: 'Minshawy_Teacher_128kbps', name: { ar: 'محمد صديق المنشاوي (المصحف المعلّم مع الأطفال)', en: "Mohamed Siddiq Al-Minshawi (Mu'allim, with children)" } },
] as const
type Reciter = (typeof RECITERS)[number]
const DEFAULT = RECITERS[0]
const audioBase = (r: Reciter) => `https://everyayah.com/data/${r.folder}`
const CACHE = join(ROOT, '.tools', 'quran')
const OUT = join(ROOT, 'content', 'quran', 'surahs.json')

const sha256 = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex')
const pad = (n: number) => String(n).padStart(3, '0')

async function get(url: string, kind: 'text' | 'buffer' = 'text'): Promise<string | Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return kind === 'text' ? await res.text() : Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (attempt >= 4) throw new Error(`download failed: ${url} — ${(e as Error).message}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
}

function fail(msg: string): never {
  console.error(`\n✖ VERIFICATION FAILED — nothing written.\n  ${msg}`)
  process.exit(1)
}

mkdirSync(CACHE, { recursive: true })
for (const r of RECITERS) mkdirSync(join(ROOT, 'public', 'assets', 'quran', r.id), { recursive: true })

// 1. Text (verbatim) + copyright notice
console.log('text: downloading Tanzil Uthmani…')
const rawText = (await get(TEXT_URL)) as string
writeFileSync(join(CACHE, 'quran-uthmani.txt'), rawText, 'utf8')
const textSha = sha256(rawText)
const notice = rawText
  .split(/\r?\n/)
  .filter((l) => l.startsWith('#'))
  .join('\n')
if (!/Tanzil Quran Text \(Uthmani/.test(notice) || !/CHANGING IT IS NOT ALLOWED/.test(notice)) fail('unexpected Tanzil file header')
const verses = new Map<string, string>()
for (const line of rawText.split(/\r?\n/)) {
  const m = /^(\d+)\|(\d+)\|(.+)$/.exec(line)
  if (m) verses.set(`${m[1]}:${m[2]}`, m[3] as string)
}
if (verses.size !== 6236) fail(`expected 6236 ayahs in the Tanzil file, found ${verses.size}`)
const basmala = verses.get('1:1') as string

// 2. Metadata (names + ayah counts) from Tanzil
const meta = (await get(META_URL)) as string
const suraBlock = meta.slice(meta.indexOf('QuranData.Sura = ['), meta.indexOf('];', meta.indexOf('QuranData.Sura = [')))
// Quoted field: '…' or "…" (transliterations like "Al-An'aam" contain apostrophes).
const Q = `(?:'([^']*)'|"([^"]*)")`
const suraRe = new RegExp(`\\[\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*${Q},\\s*${Q},\\s*${Q},\\s*${Q}\\s*\\]`, 'g')
const suraMeta = [...suraBlock.matchAll(suraRe)].map((m) => ({
  ayas: Number(m[2]),
  name: (m[5] ?? m[6]) as string,
  tname: (m[7] ?? m[8]) as string,
  ename: (m[9] ?? m[10]) as string,
}))
if (suraMeta.length !== 114) fail(`expected 114 surahs in Tanzil metadata, found ${suraMeta.length}`)

const isArabicWord = (t: string) => /[ء-يٱ-ۓ]/.test(t)

const surahs = []
for (const number of SURAHS) {
  const m = suraMeta[number - 1]!
  const ayahs: { n: number; text: string }[] = []
  for (let a = 1; verses.has(`${number}:${a}`); a++) ayahs.push({ n: a, text: verses.get(`${number}:${a}`)! })
  if (ayahs.length !== m.ayas) fail(`surah ${number}: ${ayahs.length} ayahs in text vs ${m.ayas} in metadata`)

  // Basmala heading: Tanzil's text file prefixes it to ayah 1 of surahs other than 1 and 9.
  const basmalaHeading = number !== 1 && number !== 9
  if (basmalaHeading && ayahs[0]!.text.startsWith(`${basmala} `)) ayahs[0]!.text = ayahs[0]!.text.slice(basmala.length + 1)

  // 3. Independent cross-check with quran.com
  const chapter = JSON.parse((await get(`${QURANCOM}/chapters/${number}`)) as string).chapter
  if (chapter.verses_count !== m.ayas) fail(`surah ${number}: quran.com has ${chapter.verses_count} ayahs, Tanzil ${m.ayas}`)
  const qv = JSON.parse((await get(`${QURANCOM}/verses/by_chapter/${number}?words=true&per_page=50`)) as string).verses as {
    verse_number: number
    words: { char_type_name: string }[]
  }[]
  for (const v of qv) {
    const ours = ayahs[v.verse_number - 1]
    const theirs = v.words.filter((w) => w.char_type_name === 'word').length
    const count = ours ? ours.text.split(/\s+/).filter(isArabicWord).length : -1
    if (count !== theirs) fail(`surah ${number}:${v.verse_number}: ${count} words (Tanzil) vs ${theirs} (quran.com)`)
  }

  // 4. Audio
  const withAudio = []
  for (const a of ayahs) withAudio.push({ ...a, ...(await audioFor(number, a.n, DEFAULT)), more: await moreAudio(number, a.n) })
  surahs.push({ number, nameAr: m.name, nameTranslit: m.tname, nameEn: m.ename, ayahCount: m.ayas, basmalaHeading, ayahs: withAudio })
  console.log(`✔ ${number} ${m.name} — ${m.ayas} ayahs verified, audio ok`)
}

async function audioFor(surah: number, ayah: number, reciter: Reciter): Promise<{ audio: string; sha256: string }> {
  const file = `${pad(surah)}${pad(ayah)}.mp3`
  const target = join(ROOT, 'public', 'assets', 'quran', reciter.id, file)
  if (!existsSync(target)) {
    const buf = (await get(`${audioBase(reciter)}/${file}`, 'buffer')) as Buffer
    // MP3 frame sync or ID3 tag, and a plausible size.
    const isMp3 = buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0)
    if (!isMp3 || buf.length < 4000) fail(`${file}: not a valid MP3 recording`)
    writeFileSync(target, buf)
  }
  return { audio: `quran/${reciter.id}/${file}`, sha256: sha256(readFileSync(target)) }
}

/** The same ayah by every other reciter, keyed by reciter id. */
async function moreAudio(surah: number, ayah: number): Promise<Record<string, { audio: string; sha256: string }>> {
  const out: Record<string, { audio: string; sha256: string }> = {}
  for (const r of RECITERS.slice(1)) out[r.id] = await audioFor(surah, ayah, r)
  return out
}

const basmalaAudio = { ...(await audioFor(1, 1, DEFAULT)), more: await moreAudio(1, 1) }
const data = QuranZ.parse({
  source: {
    text: 'Tanzil Quran Text (Uthmani, Version 1.1) — Hafs',
    textUrl: 'https://tanzil.net',
    textLicense: 'Creative Commons Attribution 3.0 — verbatim copies only; changing the text is not allowed',
    textNotice: notice,
    textSha256: textSha,
    reciter: DEFAULT.name,
    audioUrl: `${audioBase(DEFAULT)}/`,
    reciters: RECITERS.map((r) => ({ id: r.id, name: r.name, audioUrl: `${audioBase(r)}/` })),
    crossCheck: 'Ayah counts checked against Tanzil metadata and quran.com; per-ayah word counts checked against quran.com word-by-word data.',
    fetchedAt: new Date().toISOString(),
  },
  basmala: { text: basmala, ...basmalaAudio },
  surahs,
})
mkdirSync(join(ROOT, 'content', 'quran'), { recursive: true })
writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8')
console.log(`\nwrote ${OUT} (${surahs.length} surahs, ${surahs.reduce((n, s) => n + s.ayahs.length, 0)} ayahs)`)
