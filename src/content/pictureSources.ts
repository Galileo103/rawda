/**
 * Where each picture comes from. Almost everything is OpenMoji; a few animals use
 * Google's Noto Emoji instead because OpenMoji's versions are hard for small children
 * to tell apart (its cat and dog are near-identical orange side views, and its lion
 * has no clear mane). Pure, so scripts/fetch-assets.ts can use it too.
 */
export const NOTO_VERSION = 'v2.047'

/** Hex codes drawn from Noto Emoji (bundled in public/assets/noto). */
export const NOTO_HEXES: ReadonlySet<string> = new Set(['1F431', '1F436', '1F981'])

/** Path under public/assets for a picture code. */
export function picturePath(hex: string): string {
  return NOTO_HEXES.has(hex) ? `noto/${hex}.svg` : `openmoji/${hex}.svg`
}
