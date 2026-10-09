import type { Lang } from '../../domain/types'

/**
 * Lenient "did the child say the word?" check for on-device speech recognition results.
 * Young children's speech is still developing and recognisers are trained on adults, so the
 * bar is low on purpose: a match can only ever lead to a celebration — a non-match never
 * marks the child wrong (the app falls back to listen-to-yourself + self-check).
 */
export function normalizeSpeech(text: string, lang: Lang): string {
  let t = text.toLowerCase().normalize('NFKC')
  if (lang === 'ar') {
    t = t
      .replace(/[ً-ْٰـ]/g, '') // tashkeel, dagger alef, tatweel
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/^ال/, '') // "the" prefix: تفاحة ≈ التفاحة
      .replace(/ ال/g, ' ')
  }
  return t.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] as number
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j] as number
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length] as number
}

/** 0..1 similarity (1 = identical). */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max
}

export const MATCH_THRESHOLD = 0.6

/** How a word was practised, stored as attempt `quality` for the parent dashboard (never for mastery). */
export const SPEECH_QUALITY = { heard: 1, selfCheckedRecording: 0.7, saidAloud: 0.5 } as const

/** True when any recogniser alternative contains something close enough to the target word. */
export function speechMatches(alternatives: readonly string[], target: string, lang: Lang): boolean {
  const want = normalizeSpeech(target, lang)
  if (!want) return false
  for (const alt of alternatives) {
    const heard = normalizeSpeech(alt, lang)
    if (!heard) continue
    if (heard === want || heard.includes(want)) return true
    const words = heard.split(' ')
    const span = want.split(' ').length
    // Compare against every run of words of the target's length ("I said apple" → "apple").
    for (let i = 0; i + span <= words.length; i++) {
      if (similarity(words.slice(i, i + span).join(' '), want) >= MATCH_THRESHOLD) return true
    }
  }
  return false
}
