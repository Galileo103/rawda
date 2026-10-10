/**
 * Asset resolution. All art and audio is bundled under public/assets so it works offline.
 * Missing files never crash: images fall back to the system emoji, then a soft placeholder.
 */
import { picturePath } from './pictureSources'

const BASE = import.meta.env.BASE_URL ?? './'

/** URL of a picture by its emoji hex code (OpenMoji, or Noto for the few listed in pictureSources). */
export function openmojiUrl(hex: string): string {
  return `${BASE}assets/${picturePath(hex)}`
}

export function assetUrl(path: string): string {
  return `${BASE}assets/${path.replace(/^\/+/, '')}`
}

/** Unicode emoji for an OpenMoji hex code — the offline fallback when an SVG is missing. */
export function emojiFromHex(hex: string): string {
  try {
    return String.fromCodePoint(...hex.split('-').map((h) => parseInt(h, 16)))
  } catch {
    return '⭐'
  }
}
