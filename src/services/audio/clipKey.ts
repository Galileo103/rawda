import type { Lang } from '../../domain/types'

/**
 * Stable key for a pre-rendered narration clip. Shared by the app (lookup) and
 * scripts/render-audio.ts (generation), so text edits automatically map to new clips.
 */
export function normalizeSpeech(text: string): string {
  return text.normalize('NFC').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

export function clipKey(lang: Lang, text: string): string {
  const s = `${lang}|${normalizeSpeech(text)}`
  return `${lang}-${fnv1a(s, 0x811c9dc5)}${fnv1a(s, 0x01000193)}`
}

function fnv1a(s: string, seed: number): string {
  let h = seed >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
