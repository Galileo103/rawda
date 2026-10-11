/**
 * الربط التراكمي (cumulative linking), the classic way children memorise a surah:
 * learn the new ayah on its own, then recite it joined to everything before it.
 * 1 · 2 · 1 2 · 3 · 1 2 3 · 4 · 1 2 3 4 …
 */
export function cumulativeOrder<T>(ayahs: readonly T[]): T[] {
  const out: T[] = []
  ayahs.forEach((ayah, k) => {
    out.push(ayah)
    if (k > 0) out.push(...ayahs.slice(0, k + 1))
  })
  return out
}

/** How long the child gets to repeat an ayah: about as long as the recitation, within sensible bounds. */
export function pauseFor(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 3000
  return Math.round(Math.min(15000, Math.max(2000, seconds * 1000)))
}
