import manifest from '../../content/generated/audio-manifest.json'
import { assetUrl } from '../../content/assets'
import { type Gender, HERO_WORD, resolveGender, splitName } from '../../domain/child'
import type { Lang } from '../../domain/types'
import { clipKey, normalizeSpeech } from './clipKey'

export type SpeakResult = 'file' | 'tts' | 'none' | 'muted' | 'stopped'
export type SfxName = 'tap' | 'correct' | 'try' | 'complete' | 'pop' | 'flip' | 'sparkle' | 'boing' | 'munch' | 'nope' | 'gasp' | 'hop' | 'splash'

export interface AudioConfig {
  narration: boolean
  narrationVolume: number
  sfxVolume: number
  speechRate: number
}

const clips: Record<string, string> = (manifest as { clips: Record<string, string> }).clips

/**
 * Narration + sound effects.
 * 1. Pre-rendered clip (bundled, offline) when one exists for the exact text.
 * 2. Device speech synthesis, only if a voice for the language is installed.
 * 3. Otherwise 'none' — the UI always shows the text (and the mascot) as a visual alternative.
 * Nothing here throws: missing or broken audio never interrupts the child.
 */
export class AudioService {
  private config: AudioConfig = { narration: true, narrationVolume: 0.9, sfxVolume: 0.5, speechRate: 1 }
  private token = 0
  private current: HTMLAudioElement | undefined
  private sound: HTMLAudioElement | undefined
  private ctx: AudioContext | undefined
  private listeners = new Set<(speaking: boolean) => void>()
  private child: { gender?: Gender; urls: Partial<Record<Lang, string>> } = { urls: {} }

  configure(c: Partial<AudioConfig>): void {
    this.config = { ...this.config, ...c }
    if (!this.config.narration) this.stop()
  }

  hasClip(lang: Lang, text: string): boolean {
    return clipKey(lang, text) in clips
  }

  onSpeakingChange(fn: (speaking: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * The child, for lines with the name slot (@name): the parent's name recordings
   * (object URLs owned here) and gender for the "our hero/heroine" fallback.
   */
  setChild(gender: Gender | undefined, recordings: Partial<Record<Lang, Blob>>): void {
    for (const url of Object.values(this.child.urls)) revoke(url)
    const urls: Partial<Record<Lang, string>> = {}
    for (const [lang, blob] of Object.entries(recordings) as [Lang, Blob | undefined][]) {
      if (!blob) continue
      try {
        urls[lang] = URL.createObjectURL(blob)
      } catch {
        /* no object URLs here: the fallback word is said instead */
      }
    }
    this.child = { gender, urls }
  }

  /** Speak one line. Resolves when finished (or interrupted). */
  async speak(text: string, lang: Lang): Promise<SpeakResult> {
    this.stop()
    const token = ++this.token
    const clean = normalizeSpeech(text)
    if (!clean) return 'none'
    if (!this.config.narration || this.config.narrationVolume <= 0) return 'muted'
    this.emit(true)
    try {
      let result: SpeakResult = 'none'
      // Lines with the child's name play as pieces: Hala, then the parent's recording, then Hala.
      for (const piece of splitName(clean)) {
        const r = piece === null ? await this.sayName(lang, token) : await this.sayText(piece, lang, token)
        if (token !== this.token) return 'stopped'
        if (r !== 'none') result = r
      }
      return result
    } finally {
      if (token === this.token) this.emit(false)
    }
  }

  private async sayText(clean: string, lang: Lang, token: number): Promise<'file' | 'tts' | 'none'> {
    const file = clips[clipKey(lang, clean)]
    if (file && (await this.playFile(assetUrl(`audio/${file}`), token))) return 'file'
    if (token !== this.token) return 'none'
    return (await this.speakTts(clean, lang, token)) ? 'tts' : 'none'
  }

  /** The name as the parent recorded it (either language: a name sounds the same), else "our hero/heroine". */
  private async sayName(lang: Lang, token: number): Promise<'file' | 'tts' | 'none'> {
    const url = this.child.urls[lang] ?? this.child.urls[lang === 'ar' ? 'en' : 'ar']
    if (url && (await this.playFile(url, token))) return 'file'
    if (token !== this.token) return 'none'
    return this.sayText(resolveGender(HERO_WORD[lang], this.child.gender), lang, token)
  }

  /** Speak several lines in order; stops early if anything else starts speaking. */
  async speakAll(parts: { text: string; lang: Lang }[]): Promise<void> {
    for (const p of parts) {
      const before = this.token
      const r = await this.speak(p.text, p.lang)
      if (r === 'stopped' || this.token !== before + 1) return
    }
  }

  stop(): void {
    this.token++
    if (this.current) {
      try {
        this.current.pause()
      } catch {
        /* ignore */
      }
      this.current = undefined
    }
    try {
      globalThis.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
    this.emit(false)
  }

  private speakingNow = false

  /** Whether Hala is talking right now (a game waits for quiet before an animal's call). */
  get speaking(): boolean {
    return this.speakingNow
  }

  private emit(speaking: boolean) {
    this.speakingNow = speaking
    for (const l of this.listeners) l(speaking)
  }

  private playFile(url: string, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      let el: HTMLAudioElement
      try {
        el = new Audio(url)
      } catch {
        resolve(false)
        return
      }
      this.current = el
      el.volume = clamp(this.config.narrationVolume)
      el.playbackRate = this.config.speechRate
      let started = false
      const done = (ok: boolean) => {
        el.onended = el.onerror = null
        resolve(ok)
      }
      el.onplaying = () => {
        started = true
      }
      el.onended = () => done(true)
      el.onerror = () => done(started)
      const watchdog = setInterval(() => {
        if (token !== this.token) {
          clearInterval(watchdog)
          done(true)
        }
      }, 150)
      el.addEventListener('ended', () => clearInterval(watchdog))
      el.addEventListener('error', () => clearInterval(watchdog))
      const p = el.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          clearInterval(watchdog)
          done(false)
        })
      }
    })
  }

  private async speakTts(text: string, lang: Lang, token: number): Promise<boolean> {
    const synth = globalThis.speechSynthesis
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false
    const voice = await findVoice(lang)
    if (!voice || token !== this.token) return false
    return new Promise((resolve) => {
      try {
        const u = new SpeechSynthesisUtterance(text)
        u.voice = voice
        u.lang = voice.lang
        u.rate = 0.9 * this.config.speechRate
        u.volume = clamp(this.config.narrationVolume)
        u.onend = () => resolve(true)
        u.onerror = () => resolve(false)
        synth.speak(u)
      } catch {
        resolve(false)
      }
    })
  }

  /** Short synthesized effects (no audio files needed, no licensing). */
  /**
   * A short recorded sound (an animal's real call) on its own player, so it never cuts
   * Hala's narration. Plays at the effects volume; resolves when it ends or fails.
   */
  playSound(url: string): Promise<void> {
    if (this.config.sfxVolume <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      try {
        this.sound?.pause()
        const el = new Audio(url)
        this.sound = el
        el.volume = clamp(Math.min(1, this.config.sfxVolume * 1.6))
        el.onended = el.onerror = () => resolve()
        const p = el.play()
        if (p && typeof p.catch === 'function') p.catch(() => resolve())
      } catch {
        resolve()
      }
    })
  }

  /** Stop a recorded sound (leaving a game). */
  stopSound(): void {
    try {
      this.sound?.pause()
    } catch {
      /* ignore */
    }
    this.sound = undefined
  }

  sfx(name: SfxName): void {
    if (this.config.sfxVolume <= 0) return
    try {
      const Ctx = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      this.ctx ??= new Ctx()
      const ctx = this.ctx
      if (ctx.state === 'suspended') void ctx.resume()
      const notes = SFX[name]
      const t0 = ctx.currentTime + 0.01
      for (const [freq, start, dur, type] of notes) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type ?? 'sine'
        osc.frequency.value = freq
        const peak = 0.18 * this.config.sfxVolume
        gain.gain.setValueAtTime(0.0001, t0 + start)
        gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t0 + start)
        osc.stop(t0 + start + dur + 0.05)
      }
    } catch {
      /* audio unavailable: silently skip */
    }
  }
}

type Note = [freq: number, start: number, dur: number, type?: OscillatorType]
// Soft, friendly tones only — the "try again" sound is gentle, never a buzzer.
const SFX: Record<SfxName, Note[]> = {
  tap: [[660, 0, 0.08]],
  pop: [[880, 0, 0.07], [1175, 0.05, 0.08]],
  flip: [[520, 0, 0.06, 'triangle']],
  correct: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.22]],
  try: [[440, 0, 0.14, 'triangle'], [392, 0.12, 0.18, 'triangle']],
  complete: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]],
  // Streak of correct answers: a quick rising twinkle.
  sparkle: [[784, 0, 0.08, 'triangle'], [988, 0.06, 0.08, 'triangle'], [1175, 0.12, 0.08, 'triangle'], [1568, 0.18, 0.25, 'triangle'], [2093, 0.28, 0.3]],
  // A finger bumping a "magic wall" (Writing room): a soft, low bounce, never a buzzer.
  boing: [[392, 0, 0.09], [294, 0.07, 0.16]],
  // Play World's silly moments: little chews, a soft "no, thank you", a surprised gasp, a frog's hop and splash.
  munch: [[330, 0, 0.06, 'triangle'], [294, 0.13, 0.06, 'triangle'], [330, 0.26, 0.07, 'triangle']],
  nope: [[330, 0, 0.14, 'triangle'], [262, 0.12, 0.22, 'triangle']],
  gasp: [[523, 0, 0.06], [784, 0.05, 0.16]],
  hop: [[392, 0, 0.08], [587, 0.07, 0.12]],
  splash: [[1175, 0, 0.05, 'triangle'], [784, 0.04, 0.08, 'triangle'], [440, 0.1, 0.16]],
}

function revoke(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    /* ignore */
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v))
}

let voicesCache: SpeechSynthesisVoice[] | undefined
async function findVoice(lang: Lang): Promise<SpeechSynthesisVoice | undefined> {
  const synth = globalThis.speechSynthesis
  if (!synth) return undefined
  if (!voicesCache || voicesCache.length === 0) {
    voicesCache = synth.getVoices()
    if (voicesCache.length === 0) {
      await new Promise<void>((r) => {
        const t = setTimeout(r, 600)
        synth.addEventListener?.('voiceschanged', () => {
          clearTimeout(t)
          r()
        }, { once: true })
      })
      voicesCache = synth.getVoices()
    }
  }
  // Hala is a woman: a voice known to be male is never used (the text and Hala stay on screen instead).
  const candidates = voicesCache.filter((v) => v.lang.toLowerCase().startsWith(lang) && !(MALE.test(v.name) && !FEMALE.test(v.name)))
  return candidates.sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0]
}

/**
 * Device-voice fallback preference: modern neural voices ("Natural"/"Online" on Windows
 * and Edge) read Arabic tashkeel correctly; legacy voices often don't. Among regions,
 * prefer ones whose voices read Modern Standard Arabic the way it is taught.
 */
const PREFERRED_REGIONS: Record<Lang, string[]> = {
  ar: ['ar-sa', 'ar-ae', 'ar-qa', 'ar-eg'],
  en: ['en-us', 'en-gb'],
}
/**
 * Hala is a woman, so the fallback prefers female device voices (the browser API has no
 * gender field, so this goes by well-known voice names). A male voice is used only if the
 * device has nothing else for the language.
 */
const FEMALE = /female|hoda|salma|zariyah|amany|fatima|mariam|laila|layla|sana|amal|noura|rana|zira|aria|jenny|michelle|ana\b|libby|sonia|hazel|susan|samantha|karen|moira|tessa|victoria|ava|allison|emma|heera|catherine|natasha|clara/i
const MALE = /\bmale|naayf|hamed|shakir|bassel|taim|hamdan|omar|moaz|david|mark|guy|ryan|christopher|eric|roger|steffan|daniel|fred|george|james|william|alex\b|thomas/i
export function voiceScore(v: Pick<SpeechSynthesisVoice, 'name' | 'lang'>, lang: Lang): number {
  const region = v.lang.toLowerCase().replace('_', '-')
  const idx = PREFERRED_REGIONS[lang].indexOf(region)
  const gender = FEMALE.test(v.name) ? 40 : MALE.test(v.name) ? -40 : 0
  return gender + (/natural|online|neural/i.test(v.name) ? 10 : 0) + (idx >= 0 ? PREFERRED_REGIONS[lang].length - idx : 0)
}

export const audio = new AudioService()
