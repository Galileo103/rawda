/**
 * Where each picture comes from. Almost everything is OpenMoji; a few animals use
 * Google's Noto Emoji instead because OpenMoji's versions are hard for small children
 * to tell apart (its cat and dog are near-identical orange side views, and its lion
 * has no clear mane). Pure, so scripts/fetch-assets.ts can use it too.
 */
export const NOTO_VERSION = 'v2.047'

/** Hex codes drawn from Noto Emoji (bundled in public/assets/noto). */
export const NOTO_HEXES: ReadonlySet<string> = new Set(['1F431', '1F436', '1F981'])

/**
 * Rawda's own drawings, under private-use codes (no emoji has them). The child's hero in
 * personalized stories must be obviously a boy or a girl, and the emoji boy and girl are
 * just two similar faces; these are full-body characters in public/assets/art.
 */
export const ART_HEXES: ReadonlySet<string> = new Set(['E001', 'E002'])

/** Path under public/assets for a picture code. */
export function picturePath(hex: string): string {
  if (ART_HEXES.has(hex)) return `art/${hex}.svg`
  return NOTO_HEXES.has(hex) ? `noto/${hex}.svg` : `openmoji/${hex}.svg`
}
