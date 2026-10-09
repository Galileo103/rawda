import { type Rng, defaultRng } from '../domain/rng'

/**
 * Parent gate helpers. The PIN is stored only as a salted SHA-256 hash.
 * This keeps a pre-reader out of settings; it is not meant as strong security.
 */

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export function newSalt(): string {
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const input = `rawda:${salt}:${pin}`
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(input))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Insecure contexts (plain http on a LAN) have no SubtleCrypto: iterated FNV fallback.
  let h = 0x811c9dc5
  for (let round = 0; round < 5000; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
  }
  return `fnv-${h.toString(16)}`
}

export async function verifyPin(pin: string, hash: string | undefined, salt: string | undefined): Promise<boolean> {
  if (!hash || !salt || !isValidPin(pin)) return false
  return (await hashPin(pin, salt)) === hash
}

/**
 * Fallback challenge: a 3-digit number written as words ("seven, two, nine").
 * A child who cannot read yet can't solve it by imitation.
 */
export function makeWordsChallenge(digitWords: readonly string[], rng: Rng = defaultRng, sep = ', '): { digits: string; words: string } {
  const digits = Array.from({ length: 3 }, (_, i) => (i === 0 ? 1 + Math.floor(rng() * 9) : Math.floor(rng() * 10)))
  return { digits: digits.join(''), words: digits.map((d) => digitWords[d] ?? String(d)).join(sep) }
}
