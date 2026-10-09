/**
 * Asset resolution. All art and audio is bundled under public/assets so it works offline.
 * Missing files never crash: images fall back to the system emoji, then a soft placeholder.
 */
const BASE = import.meta.env.BASE_URL ?? './'

export function openmojiUrl(hex: string): string {
  return `${BASE}assets/openmoji/${hex}.svg`
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
