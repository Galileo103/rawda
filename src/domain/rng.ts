/** Random source; injectable so the learning engine is deterministic in tests. */
export type Rng = () => number

/** Small seeded PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const defaultRng: Rng = Math.random

export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

export function pickOne<T>(items: readonly T[], rng: Rng = defaultRng): T {
  if (items.length === 0) throw new Error('pickOne: empty list')
  return items[Math.floor(rng() * items.length)] as T
}
