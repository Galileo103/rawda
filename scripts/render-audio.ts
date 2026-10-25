/**
 * npm run audio:render — pre-renders every spoken line to MP3 so narration works offline
 * on every device (Arabic TTS is not available everywhere). The app never goes online.
 *
 * Engines (build machine only; ffmpeg must be on PATH, see docs/BUILD.md):
 *  - neural: Microsoft neural voices, which read fully vowelled Modern Standard Arabic
 *    correctly. Needs Python + `pip install edge-tts` (no key), or AZURE_SPEECH_KEY +
 *    AZURE_SPEECH_REGION for the official Azure AI Speech service (same voices).
 *  - piper:  offline Piper TTS. Needs `pip install piper-tts` and a voice in .tools/voices.
 *
 * Incremental: existing clips are kept. Changing a language's voice re-renders that
 * language from scratch (the manifest records which voice produced each language).
 * Compare Arabic voices first with `npm run audio:sample`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { collectNarration } from '../src/content/narration'
import type { Lang } from '../src/domain/types'
import { rawDictionaries } from '../src/i18n'
import { clipKey } from '../src/services/audio/clipKey'
import { ROOT, loadBundle } from './lib/contentFs'

export type VoiceSpec = { engine: 'neural'; voice: string; rate: string } | { engine: 'piper'; model: string }

/** Default Arabic voice: Modern Standard Arabic (الفصحى). Override with RAWDA_AR_VOICE. */
export const DEFAULT_AR_VOICE = 'ar-SA-ZariyahNeural'
/** A little slower than normal speech: clearer for young children. */
export const CHILD_RATE = '-10%'

const VOICES: Record<Lang, VoiceSpec> = {
  ar: { engine: 'neural', voice: process.env.RAWDA_AR_VOICE ?? DEFAULT_AR_VOICE, rate: CHILD_RATE },
  en: { engine: 'piper', model: join(ROOT, '.tools', 'voices', 'en_US-hfc_female-medium.onnx') },
}
const AUDIO_DIR = join(ROOT, 'public', 'assets', 'audio')
const MANIFEST = join(ROOT, 'src', 'content', 'generated', 'audio-manifest.json')
const TMP = join(ROOT, '.audio-cache')
const PYTHON = process.env.PYTHON ?? 'python'

interface Manifest {
  version: number
  /** Which voice rendered each language, e.g. "neural:ar-SA-ZariyahNeural@-10%". */
  voices?: Partial<Record<Lang, string>>
  clips: Record<string, string>
}

export function voiceId(spec: VoiceSpec): string {
  return spec.engine === 'neural' ? `neural:${spec.voice}@${spec.rate}` : `piper:${basename(spec.model, '.onnx')}`
}

/**
 * Runs the engine for a batch of lines. Returns the intermediate file per key (absent
 * when the engine failed for that line). Shared with scripts/sample-voices.ts.
 */
export function synthesize(spec: VoiceSpec, jobs: { key: string; text: string }[], outDir: string): Map<string, string> {
  mkdirSync(outDir, { recursive: true })
  const ext = spec.engine === 'neural' ? 'mp3' : 'wav'
  const files = new Map(jobs.map((j) => [j.key, join(outDir, `${j.key}.${ext}`)]))
  const jobsFile = join(outDir, 'jobs.json')
  writeFileSync(jobsFile, JSON.stringify(jobs.map((j) => ({ text: j.text, out: files.get(j.key) }))), 'utf8')
  if (spec.engine === 'neural') {
    execFileSync(PYTHON, [join(ROOT, 'scripts', 'neural_batch.py'), spec.voice, spec.rate, jobsFile], { stdio: 'inherit' })
  } else {
    execFileSync(PYTHON, [join(ROOT, 'scripts', 'piper_batch.py'), spec.model, jobsFile], { stdio: 'inherit' })
  }
  // A refused request can leave an empty file: that is a missing clip, not a silent one.
  for (const [key, file] of files) if (!existsSync(file) || statSync(file).size === 0) files.delete(key)
  return files
}

/** Trims leading/trailing silence and encodes mono 48 kbps: plenty for speech, small for the offline bundle. */
export function finalize(input: string, mp3: string): void {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', input,
    '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
    '-ac', '1', '-b:a', '48k', mp3,
  ])
}

function readManifest(): Manifest {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest
  } catch {
    return { version: 2, clips: {} }
  }
}

function main() {
  const { bundle, errors } = loadBundle()
  if (errors.length) {
    console.error('Fix content problems first (npm run validate:content).')
    process.exit(1)
  }

  const lines = collectNarration(bundle, rawDictionaries)
  const wanted = new Map<string, { lang: Lang; text: string }>()
  for (const l of lines) wanted.set(clipKey(l.lang, l.text), l)
  console.log(`narration: ${wanted.size} distinct lines`)

  const previous = readManifest()
  const voices: Partial<Record<Lang, string>> = {}

  // RENDER_LANGS=en renders one language only (e.g. while the online Arabic voice is unavailable).
  const only = process.env.RENDER_LANGS?.split(',')
  for (const lang of ['ar', 'en'] as const) {
    if (only && !only.includes(lang)) {
      if (previous.voices?.[lang]) voices[lang] = previous.voices[lang]
      continue
    }
    const spec = VOICES[lang]
    const id = voiceId(spec)
    const dir = join(AUDIO_DIR, lang)
    mkdirSync(dir, { recursive: true })
    const before = previous.voices?.[lang]
    if (before && before !== id) {
      console.log(`${lang}: voice changed (${before} → ${id}), rendering everything again`)
      rmSync(dir, { recursive: true, force: true })
      mkdirSync(dir, { recursive: true })
    }
    // Record the configured voice only once every clip of the language comes from it.
    voices[lang] = before ?? id

    const todo = [...wanted].filter(([key, l]) => l.lang === lang && !existsSync(join(dir, `${key}.mp3`)))
    if (todo.length === 0) {
      console.log(`${lang}: all clips present`)
      continue
    }
    if (spec.engine === 'piper' && !existsSync(spec.model)) {
      console.error(`${lang}: voice model missing at ${spec.model} — skipping (app will fall back to device speech)`)
      continue
    }
    console.log(`${lang}: rendering ${todo.length} clip(s) with ${id}…`)
    const rendered = synthesize(spec, todo.map(([key, l]) => ({ key, text: l.text })), join(TMP, lang))
    for (const [key, file] of rendered) finalize(file, join(dir, `${key}.mp3`))
    if (rendered.size === todo.length) voices[lang] = id
    else console.error(`${lang}: ${todo.length - rendered.size} clip(s) failed; run again to retry`)
  }

  // Remove clips no longer referenced by any text, then write the manifest from what exists.
  const clips: Record<string, string> = {}
  for (const lang of ['ar', 'en'] as const) {
    for (const file of readdirSync(join(AUDIO_DIR, lang))) {
      const key = file.replace(/\.mp3$/, '')
      if (!wanted.has(key)) {
        rmSync(join(AUDIO_DIR, lang, file))
        continue
      }
      clips[key] = `${lang}/${file}`
    }
  }
  const manifest: Manifest = { version: 2, voices, clips }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n', 'utf8')
  const missing = [...wanted.keys()].filter((k) => !(k in clips))
  console.log(`manifest: ${Object.keys(clips).length} clips${missing.length ? `, ${missing.length} still missing` : ''}`)
}

if (process.argv[1] && basename(process.argv[1]).startsWith('render-audio')) main()
